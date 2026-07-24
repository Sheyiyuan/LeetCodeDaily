import type {
  DailyActivity,
  Submission,
  SubmissionCandidate,
  SyncJob,
} from "@leetcode-daily/domain";
import type { CommitFile } from "@leetcode-daily/github-sync";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface StoredSyncJob extends SyncJob {
  owner: string;
  message: string;
  files: CommitFile[];
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
}

let databasePromise: Promise<IDBPDatabase<LeetCodeDailyDb>> | null = null;

export function database(): Promise<IDBPDatabase<LeetCodeDailyDb>> {
  databasePromise ??= openDB<LeetCodeDailyDb>("leetcode-daily", 1, {
    upgrade(db) {
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
    ["candidates", "submissions", "dailyActivity", "syncJobs"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("candidates").clear(),
    transaction.objectStore("submissions").clear(),
    transaction.objectStore("dailyActivity").clear(),
    transaction.objectStore("syncJobs").clear(),
  ]);
  await transaction.done;
}
