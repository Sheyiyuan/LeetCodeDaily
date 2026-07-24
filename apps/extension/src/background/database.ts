import type {
  DailyActivity,
  Submission,
  SubmissionCandidate,
  SyncJob,
} from "@leetcode-daily/domain";
import type { CommitFile } from "@leetcode-daily/github-sync";
import type { SolvedProblemSummary } from "@leetcode-daily/leetcode-cn";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface StoredSyncJob extends SyncJob {
  owner: string;
  message: string;
  files: CommitFile[];
}

export interface StoredHistoryImport {
  id: "history-import";
  state: "running" | "paused" | "cancelled" | "completed" | "failed";
  problemSlugs: SolvedProblemSummary[];
  nextIndex: number;
  importedProblems: number;
  failures: Array<{ titleSlug: string; message: string }>;
  pendingFiles: CommitFile[];
  pendingProblemCount: number;
  owner: string;
  repository: string;
  branch: string;
  rootDirectory: string;
  currentTitleSlug: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface StoredHistoricalAccepted {
  submissionId: string;
  problemId: string;
  submittedAt: string;
}

interface LeetCodeDailyDb extends DBSchema {
  candidates: {
    key: string;
    value: SubmissionCandidate & {
      attempts: number;
      lastError: string | null;
      nextAttemptAt?: string | null;
      updatedAt: string;
    };
    indexes: { "by-state": string };
  };
  submissions: {
    key: string;
    value: Submission;
    indexes: { "by-submitted-at": string };
  };
  dailyActivity: {
    key: string;
    value: DailyActivity;
  };
  syncJobs: {
    key: string;
    value: StoredSyncJob;
    indexes: { "by-state": string };
  };
  historyImport: {
    key: string;
    value: StoredHistoryImport;
  };
  historicalAccepted: {
    key: string;
    value: StoredHistoricalAccepted;
  };
}

let databasePromise: Promise<IDBPDatabase<LeetCodeDailyDb>> | null = null;

export function database(): Promise<IDBPDatabase<LeetCodeDailyDb>> {
  databasePromise ??= openDB<LeetCodeDailyDb>("leetcode-daily", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion >= 1) {
        if (!db.objectStoreNames.contains("historyImport")) {
          db.createObjectStore("historyImport", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("historicalAccepted")) {
          db.createObjectStore("historicalAccepted", {
            keyPath: "submissionId",
          });
        }
        return;
      }
      const candidates = db.createObjectStore("candidates", {
        keyPath: "key",
      });
      candidates.createIndex("by-state", "hydrationState");

      const submissions = db.createObjectStore("submissions", {
        keyPath: "key",
      });
      submissions.createIndex("by-submitted-at", "submittedAt");

      db.createObjectStore("dailyActivity", { keyPath: "localDate" });

      const jobs = db.createObjectStore("syncJobs", { keyPath: "id" });
      jobs.createIndex("by-state", "state");

      db.createObjectStore("historyImport", { keyPath: "id" });
      db.createObjectStore("historicalAccepted", {
        keyPath: "submissionId",
      });
    },
  });
  return databasePromise;
}

export async function countCandidateStates(): Promise<{
  pending: number;
  failed: number;
}> {
  const db = await database();
  const [
    pending,
    retrying,
    failed,
    permanentCandidateFailures,
    syncPending,
    syncFailed,
    permanentSyncFailures,
  ] = await Promise.all([
    db.countFromIndex("candidates", "by-state", "pending-hydration"),
    db.countFromIndex("candidates", "by-state", "retry-wait"),
    db.countFromIndex("candidates", "by-state", "retryable-failure"),
    db.countFromIndex("candidates", "by-state", "permanent-failure"),
    db.countFromIndex("syncJobs", "by-state", "pending"),
    db.countFromIndex("syncJobs", "by-state", "retryable-failure"),
    db.countFromIndex("syncJobs", "by-state", "permanent-failure"),
  ]);
  return {
    pending: pending + retrying + syncPending,
    failed:
      failed + permanentCandidateFailures + syncFailed + permanentSyncFailures,
  };
}

export async function clearDatabase(): Promise<void> {
  const db = await database();
  const transaction = db.transaction(
    [
      "candidates",
      "submissions",
      "dailyActivity",
      "syncJobs",
      "historyImport",
      "historicalAccepted",
    ],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("candidates").clear(),
    transaction.objectStore("submissions").clear(),
    transaction.objectStore("dailyActivity").clear(),
    transaction.objectStore("syncJobs").clear(),
    transaction.objectStore("historyImport").clear(),
    transaction.objectStore("historicalAccepted").clear(),
  ]);
  await transaction.done;
}
