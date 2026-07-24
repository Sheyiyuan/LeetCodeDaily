import { LeetCodeApiError } from "@leetcode-daily/leetcode-cn";

import { syncActivityToCloud } from "./activity-sync";
import { rebuildDailyActivity } from "./activity-ledger";
import {
  database,
  type StoredHistoryActivityBackfill,
} from "./database";
import { leetcodeClient } from "./leetcode";

export const HISTORY_ACTIVITY_ALARM = "history-activity-work";
const JOB_ID = "history-activity";
const PROBLEMS_PER_WAKE = 5;
const MAX_ATTEMPTS_PER_PROBLEM = 5;
let activeRun: Promise<void> | null = null;
let activeEnsure: Promise<void> | null = null;

export function historyActivityRetryDelayMs(attempts: number): number {
  return Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

export async function ensureHistoryActivityBackfill(
  username: string,
): Promise<void> {
  activeEnsure ??= ensureBackfill(username).finally(() => {
    activeEnsure = null;
  });
  return activeEnsure;
}

async function ensureBackfill(username: string): Promise<void> {
  const db = await database();
  const existing = await db.get("historyActivity", JOB_ID);
  if (existing?.username === username && existing.state === "completed") return;
  if (existing?.username === username && existing.state === "running") {
    await scheduleHistoryActivity();
    return;
  }
  if (existing?.username === username && existing.state === "failed") {
    await db.put("historyActivity", {
      ...existing,
      state: "running",
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    });
    await scheduleHistoryActivity();
    return;
  }

  const problemSlugs = await leetcodeClient.getSolvedProblems();
  const job: StoredHistoryActivityBackfill = {
    id: JOB_ID,
    username,
    state: "running",
    problemSlugs,
    nextIndex: 0,
    attempts: 0,
    failures: [],
    lastError: null,
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  };
  await db.put("historyActivity", job);
  await scheduleHistoryActivity();
}

export async function scheduleHistoryActivity(delayMs = 1_000): Promise<void> {
  await chrome.alarms.create(HISTORY_ACTIVITY_ALARM, {
    when: Date.now() + delayMs,
  });
}

export async function runHistoryActivityBackfill(): Promise<void> {
  activeRun ??= runBackfillChunk().finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function runBackfillChunk(): Promise<void> {
  const db = await database();
  const initial = await db.get("historyActivity", JOB_ID);
  if (!initial || initial.state !== "running") return;

  const codeImport = await db.get("historyImport", "history-import");
  if (codeImport?.state === "running") {
    await scheduleHistoryActivity(60_000);
    return;
  }

  // Preserve a wake-up if Chrome stops this service worker mid-request.
  await scheduleHistoryActivity(60_000);
  for (let count = 0; count < PROBLEMS_PER_WAKE; count += 1) {
    const job = await db.get("historyActivity", JOB_ID);
    if (!job || job.state !== "running") return;
    if (job.nextAttemptAt && job.nextAttemptAt > new Date().toISOString()) {
      await scheduleHistoryActivity(
        Math.max(1_000, Date.parse(job.nextAttemptAt) - Date.now()),
      );
      return;
    }
    if (job.nextIndex >= job.problemSlugs.length) {
      await completeBackfill();
      return;
    }

    const shouldContinue = await processProblem(job);
    if (!shouldContinue) return;
  }

  const current = await db.get("historyActivity", JOB_ID);
  await publishActivity(Boolean(current && current.nextIndex % 100 === 0));
  if (current?.state === "running") await scheduleHistoryActivity(2_000);
}

async function processProblem(
  job: StoredHistoryActivityBackfill,
): Promise<boolean> {
  const problem = job.problemSlugs[job.nextIndex];
  if (!problem) return true;
  const db = await database();
  try {
    const summaries = await leetcodeClient.getAcceptedSubmissions(
      problem.titleSlug,
    );
    const transaction = db.transaction("historicalAccepted", "readwrite");
    for (const summary of summaries) {
      await transaction.store.put({
        submissionId: summary.id,
        problemId: problem.questionId,
        submittedAt: new Date(summary.timestamp * 1_000).toISOString(),
      });
    }
    await transaction.done;
    await db.put("historyActivity", {
      ...job,
      nextIndex: job.nextIndex + 1,
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "历史活动读取失败";
    if (cause instanceof LeetCodeApiError && cause.code === "SIGNED_OUT") {
      await failBackfill(job, message);
      return false;
    }

    const attempts = job.attempts + 1;
    const retryable =
      !(cause instanceof LeetCodeApiError) || cause.retryable;
    if (retryable && attempts < MAX_ATTEMPTS_PER_PROBLEM) {
      const delayMs = historyActivityRetryDelayMs(attempts);
      await db.put("historyActivity", {
        ...job,
        attempts,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await scheduleHistoryActivity(delayMs);
      return false;
    }

    await db.put("historyActivity", {
      ...job,
      nextIndex: job.nextIndex + 1,
      attempts: 0,
      failures: [...job.failures, { titleSlug: problem.titleSlug, message }],
      lastError: message,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }
}

async function publishActivity(syncCloud: boolean): Promise<void> {
  await rebuildDailyActivity();
  if (syncCloud) await syncActivityToCloud().catch(() => undefined);
}

async function completeBackfill(): Promise<void> {
  const db = await database();
  const current = await db.get("historyActivity", JOB_ID);
  if (!current || current.state !== "running") return;
  await db.put("historyActivity", {
    ...current,
    state: "completed",
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  });
  await publishActivity(true);
  await chrome.alarms.clear(HISTORY_ACTIVITY_ALARM);
}

async function failBackfill(
  job: StoredHistoryActivityBackfill,
  message: string,
): Promise<void> {
  await (await database()).put("historyActivity", {
    ...job,
    state: "failed",
    lastError: message,
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  });
  await chrome.alarms.clear(HISTORY_ACTIVITY_ALARM);
}
