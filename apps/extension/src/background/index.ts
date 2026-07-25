import { localDateForInstant } from "@leetcode-daily/domain";
import type {
  DashboardState,
  ExtensionMessage,
  ExtensionSettings,
  GitHubAuthState,
  HistoryImportStatus,
  MessageResponse,
} from "../shared/messages";
import { rebuildDailyActivity } from "./activity-ledger";
import { syncActivityToCloud } from "./activity-sync";
import { connectGitHub, deleteGitHubAccount, disconnectGitHub, readGitHubAuth } from "./auth";
import { clearBadge, setCompletedBadge, setFailureBadge } from "./badge";
import { observeAccepted, retryCandidates } from "./candidates";
import { readDashboard, refreshDashboard } from "./dashboard";
import { clearDatabase, countCandidateStates, database } from "./database";
import {
  ensureHistoryActivityBackfill,
  HISTORY_ACTIVITY_ALARM,
  runHistoryActivityBackfill,
} from "./history-activity";
import {
  cancelHistoryImport,
  HISTORY_IMPORT_ALARM,
  pauseHistoryImport,
  readHistoryImport,
  resumeHistoryImport,
  runHistoryImport,
  startHistoryImport,
} from "./history-import";
import { readRepositoryBranches } from "./repositories";
import { readSettings, writeSettings } from "./settings";
import { retrySyncJobs } from "./sync";

const RETRY_ALARM = "retry-failed-work";

async function refreshDashboardAndBackfill(): Promise<DashboardState> {
  const dashboard = await refreshDashboard();
  if (dashboard.account?.isSignedIn && dashboard.account.username) {
    await ensureHistoryActivityBackfill(dashboard.account.username).catch(() => undefined);
  }
  return readDashboard();
}

async function retryWork(force: boolean): Promise<void> {
  await retryCandidates(force);
  await retrySyncJobs(force);
  await syncActivityToCloud().catch(() => undefined);
  const states = await countCandidateStates();
  if (states.failed > 0) {
    await setFailureBadge();
    return;
  }
  const settings = await readSettings();
  const today = localDateForInstant(new Date(), settings.timezone);
  const activity = await (await database()).get("dailyActivity", today);
  if (activity && activity.acceptedSubmissionCount > 0) {
    await setCompletedBadge();
  } else {
    await clearBadge();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshDashboardAndBackfill()
    .then(() => retryWork(false))
    .catch(() => undefined);
  void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  void retryWork(false);
  void refreshDashboardAndBackfill().catch(() => undefined);
  void readHistoryImport().then((status) => {
    if (status.state === "running") void runHistoryImport();
  });
  void runHistoryActivityBackfill();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void retryWork(false);
  if (alarm.name === HISTORY_IMPORT_ALARM) void runHistoryImport();
  if (alarm.name === HISTORY_ACTIVITY_ALARM) {
    void runHistoryActivityBackfill();
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (
      response: MessageResponse<
        | DashboardState
        | ExtensionSettings
        | undefined
        | GitHubAuthState
        | string[]
        | HistoryImportStatus
      >,
    ) => void,
  ) => {
    void (async () => {
      try {
        switch (message.type) {
          case "accepted-observed":
            await observeAccepted(message.payload);
            sendResponse({ ok: true });
            break;
          case "dashboard-refresh":
            sendResponse({
              ok: true,
              data: await refreshDashboardAndBackfill(),
            });
            break;
          case "dashboard-read":
            sendResponse({ ok: true, data: await readDashboard() });
            break;
          case "github-auth-read":
            sendResponse({ ok: true, data: await readGitHubAuth() });
            break;
          case "github-connect":
            {
              const auth = await connectGitHub();
              await syncActivityToCloud().catch(() => undefined);
              sendResponse({ ok: true, data: auth });
            }
            break;
          case "github-disconnect":
            await disconnectGitHub();
            sendResponse({ ok: true });
            break;
          case "github-delete-account":
            await deleteGitHubAccount();
            await clearDatabase();
            sendResponse({ ok: true });
            break;
          case "github-branches-read":
            sendResponse({
              ok: true,
              data: await readRepositoryBranches(message.payload.repository),
            });
            break;
          case "history-import-read":
            sendResponse({ ok: true, data: await readHistoryImport() });
            break;
          case "history-import-start":
            sendResponse({ ok: true, data: await startHistoryImport() });
            break;
          case "history-import-pause":
            sendResponse({ ok: true, data: await pauseHistoryImport() });
            break;
          case "history-import-resume":
            sendResponse({ ok: true, data: await resumeHistoryImport() });
            break;
          case "history-import-cancel":
            sendResponse({ ok: true, data: await cancelHistoryImport() });
            break;
          case "retry-all":
            await retryWork(true);
            sendResponse({ ok: true, data: await readDashboard() });
            break;
          case "settings-read":
            sendResponse({ ok: true, data: await readSettings() });
            break;
          case "settings-write":
            await writeSettings(message.payload);
            await rebuildDailyActivity();
            await syncActivityToCloud();
            sendResponse({ ok: true });
            break;
        }
      } catch (cause) {
        sendResponse({
          ok: false,
          error: cause instanceof Error ? cause.message : "未知错误",
        });
      }
    })();
    return true;
  },
);
