export const LEETCODE_SITE = "leetcode.cn" as const;

export type LeetCodeSite = typeof LEETCODE_SITE;

export type Difficulty = "Easy" | "Medium" | "Hard";

export type HydrationState =
  | "pending-hydration"
  | "retry-wait"
  | "hydrated"
  | "retryable-failure"
  | "permanent-failure";

export type SyncJobState =
  | "pending"
  | "syncing"
  | "succeeded"
  | "retryable-failure"
  | "permanent-failure";

export interface AccountStatus {
  site: LeetCodeSite;
  isSignedIn: boolean;
  username: string | null;
  avatarUrl: string | null;
  observedAt: string;
}

export interface SolvedStats {
  total: number;
  easy: number;
  medium: number;
  hard: number;
  observedAt: string;
}

export interface TopicTag {
  slug: string;
  name: string;
  translatedName: string | null;
}

export interface Problem {
  site: LeetCodeSite;
  questionId: string;
  frontendId: string;
  title: string;
  translatedTitle: string | null;
  titleSlug: string;
  difficulty: Difficulty;
  contentHtml: string;
  translatedContentHtml: string | null;
  topicTags: TopicTag[];
  canonicalUrl: string;
}

export interface SubmissionCandidate {
  key: string;
  site: LeetCodeSite;
  submissionId: string | null;
  titleSlug: string;
  observedAt: string;
  hydrationState: HydrationState;
}

export interface Submission {
  key: string;
  site: LeetCodeSite;
  submissionId: string;
  problemId: string;
  frontendId: string;
  titleSlug: string;
  status: "Accepted";
  language: string;
  submittedAt: string;
  code: string;
}

export interface DailyActivity {
  localDate: string;
  timezone: string;
  acceptedSubmissionCount: number;
  distinctProblemIds: string[];
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  submissionKey: string;
  repository: string;
  branch: string;
  targetPath: string;
  desiredContentHash: string;
  state: SyncJobState;
  attempts: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
