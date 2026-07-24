import type {
  DashboardState,
  ExtensionMessage,
  ExtensionSettings,
  GitHubAuthState,
  GitHubRepositorySummary,
  MessageResponse,
} from "../shared/messages";
import { localDateForInstant } from "@leetcode-daily/domain";
import { observeAccepted, retryCandidates } from "./candidates";
import {
  connectGitHub,
  deleteGitHubAccount,
  disconnectGitHub,
  readGitHubAuth,
} from "./auth";
import { syncActivityToCloud } from "./activity-sync";
import { readDashboard, refreshDashboard } from "./dashboard";
import {
  readAuthorizedRepositories,
  readRepositoryBranches,
} from "./repositories";
import { readSettings, writeSettings } from "./settings";
import { retrySyncJobs } from "./sync";
import { clearDatabase, countCandidateStates, database } from "./database";
import { clearBadge, setCompletedBadge, setFailureBadge } from "./badge";

const RETRY_ALARM = "retry-failed-work";

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
  void refreshDashboard();
  void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void retryWork(false);
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
        | GitHubRepositorySummary[]
        | string[]
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
            sendResponse({ ok: true, data: await refreshDashboard() });
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
          case "github-repositories-read":
            sendResponse({ ok: true, data: await readAuthorizedRepositories() });
            break;
          case "github-branches-read":
            sendResponse({
              ok: true,
              data: await readRepositoryBranches(message.payload.repository),
            });
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
