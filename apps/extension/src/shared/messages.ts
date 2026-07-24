import type {
  AccountStatus,
  SolvedStats,
  SubmissionCandidate,
} from "@leetcode-daily/domain";

export interface ActivityDaySummary {
  localDate: string;
  acceptedSubmissionCount: number;
  distinctProblemCount: number;
}

export interface GitHubRepositorySummary {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
}

export type HistoryImportState =
  | "idle"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

export interface HistoryImportStatus {
  state: HistoryImportState;
  totalProblems: number;
  processedProblems: number;
  importedProblems: number;
  failedProblems: number;
  currentTitleSlug: string | null;
  lastError: string | null;
  failures: Array<{ titleSlug: string; message: string }>;
  startedAt: string | null;
  updatedAt: string | null;
}

export type ExtensionMessage =
  | {
      type: "accepted-observed";
      payload: Pick<
        SubmissionCandidate,
        "submissionId" | "titleSlug" | "observedAt"
      >;
    }
  | { type: "dashboard-refresh" }
  | { type: "dashboard-read" }
  | { type: "github-auth-read" }
  | { type: "github-connect" }
  | { type: "github-disconnect" }
  | { type: "github-delete-account" }
  | { type: "github-repositories-read" }
  | {
      type: "github-branches-read";
      payload: { repository: string };
    }
  | { type: "history-import-read" }
  | { type: "history-import-start" }
  | { type: "history-import-pause" }
  | { type: "history-import-resume" }
  | { type: "history-import-cancel" }
  | { type: "retry-all" }
  | { type: "settings-read" }
  | { type: "settings-write"; payload: ExtensionSettings };

export interface ExtensionSettings {
  timezone: string;
  githubRepository: string | null;
  githubBranch: string;
  githubRootDirectory: string;
  includeProblemContent: boolean;
  heatmapPublicEnabled: boolean;
}

export interface GitHubAuthState {
  connected: boolean;
  login: string | null;
  sessionExpiresAt: string | null;
  heatmapUrl: string | null;
}

export interface DashboardState {
  account: AccountStatus | null;
  stats: SolvedStats | null;
  activityDays: ActivityDaySummary[];
  todayLocalDate: string;
  pendingCount: number;
  failedCount: number;
  lastSuccessfulRefreshAt: string | null;
  error: string | null;
}

export interface MessageResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
