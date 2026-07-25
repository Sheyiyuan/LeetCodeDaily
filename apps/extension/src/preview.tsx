import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { GITHUB_REPOSITORY_PERMISSION_MESSAGE } from "./background/github-errors";
import type {
  DashboardState,
  ExtensionSettings,
  GitHubAuthState,
  HistoryImportStatus,
  MessageResponse,
} from "./shared/messages";

const previewParams = new URLSearchParams(window.location.search);
const showQueueFailure = previewParams.get("failure") === "1";

const dashboard: DashboardState = {
  account: {
    site: "leetcode.cn",
    isSignedIn: true,
    username: "yuhhhy",
    displayName: "YPSH",
    avatarUrl: null,
    observedAt: "2026-07-30T08:16:00.000Z",
  },
  stats: {
    total: 128,
    easy: 56,
    medium: 62,
    hard: 10,
    observedAt: "2026-07-30T08:16:00.000Z",
  },
  activityDays: Array.from({ length: 60 }, (_, index) => ({
    localDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    acceptedSubmissionCount: (index % 4) + 1,
    distinctProblemCount: index % 5,
  })),
  todayLocalDate: "2026-07-30",
  streakDays: 7,
  pendingCount: showQueueFailure ? 0 : 1,
  failedCount: showQueueFailure ? 3 : 0,
  lastSuccessfulRefreshAt: "2026-07-30T08:16:00.000Z",
  error: showQueueFailure ? GITHUB_REPOSITORY_PERMISSION_MESSAGE : null,
};

const github: GitHubAuthState = {
  connected: true,
  login: "yuhhhy",
  sessionExpiresAt: "2026-08-30T08:16:00.000Z",
  heatmapUrl: "https://leetcode-daily-api.example/heatmap/github/yuhhhy.svg",
};

const settings: ExtensionSettings = {
  timezone: "Asia/Shanghai",
  githubRepository: "yuhhhy/leetcode-solutions",
  githubBranch: "main",
  githubRootDirectory: "",
  heatmapPublicEnabled: true,
};

const historyImport: HistoryImportStatus = {
  state: "running",
  totalProblems: 120,
  processedProblems: 72,
  importedProblems: 69,
  failedProblems: 3,
  failures: [
    { titleSlug: "two-sum", message: "题目详情暂时不可用" },
    { titleSlug: "valid-parentheses", message: "GitHub 写入被限流" },
    { titleSlug: "merge-intervals", message: "提交代码为空" },
  ],
  currentTitleSlug: "binary-tree-level-order-traversal",
  lastError: null,
  startedAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T08:16:00.000Z",
};

const storage = new Map<string, unknown>([["uiTheme", "dark"]]);

function response<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

function installChromeMock(): void {
  const chromeMock = {
    runtime: {
      openOptionsPage: async () => undefined,
      sendMessage: async (message: { type: string }): Promise<MessageResponse<unknown>> => {
        switch (message.type) {
          case "dashboard-read":
          case "dashboard-refresh":
          case "retry-all":
            return response(dashboard);
          case "github-auth-read":
            return response(github);
          case "settings-read":
            return response(settings);
          case "github-branches-read":
            return response(["main", "develop"]);
          case "history-import-read":
            return response(historyImport);
          case "history-import-start":
          case "history-import-pause":
          case "history-import-resume":
          case "history-import-cancel":
            return response(historyImport);
          case "settings-write":
          case "github-connect":
          case "github-disconnect":
          case "github-delete-account":
            return response(undefined);
          default:
            return { ok: false, error: `未模拟消息：${message.type}` };
        }
      },
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage.get(key) }),
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) storage.set(key, value);
        },
      },
    },
  };
  Object.assign(globalThis, { chrome: chromeMock });
}

installChromeMock();
const view = previewParams.get("view");
const loaded = view === "options" ? await import("./options/App") : await import("./popup/App");
const PreviewApp = loaded.App;
const previewRoot = document.getElementById("root");
if (!previewRoot) throw new Error("Preview root is missing");
createRoot(previewRoot).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
