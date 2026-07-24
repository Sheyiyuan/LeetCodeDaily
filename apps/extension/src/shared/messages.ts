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
  | { type: "retry-all" }
  | { type: "settings-read" }
  | { type: "settings-write"; payload: ExtensionSettings };

export interface ExtensionSettings {
  timezone: string;
  githubRepository: string | null;
  githubBranch: string;
  githubRootDirectory: string;
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
