import { localDateForInstant, type AccountStatus, type SolvedStats } from "@leetcode-daily/domain";
import type { DashboardState } from "../shared/messages";
import { countCandidateStates, database } from "./database";
import { displayStoredSyncFailure } from "./github-errors";
import { leetcodeClient } from "./leetcode";
import { readSettings } from "./settings";
import { calculateCurrentStreak } from "./streak";

let account: AccountStatus | null = null;
let stats: SolvedStats | null = null;
let lastSuccessfulRefreshAt: string | null = null;
let error: string | null = null;

export function selectRecentActivityDays<T extends { localDate: string }>(
  days: T[],
  count = 60,
): T[] {
  return [...days]
    .sort((left, right) => left.localDate.localeCompare(right.localDate))
    .slice(-Math.max(0, count));
}

export function latestFailureMessage(
  candidates: Array<{
    hydrationState: string;
    lastError: string | null;
    updatedAt: string;
  }>,
  syncJobs: Array<{
    state: string;
    lastErrorMessage: string | null;
    updatedAt: string;
  }>,
): string | null {
  const failures: Array<{ message: string; updatedAt: string }> = [];
  for (const candidate of candidates) {
    const message = candidate.lastError?.trim();
    if (
      message &&
      (candidate.hydrationState === "retryable-failure" ||
        candidate.hydrationState === "permanent-failure")
    ) {
      failures.push({ message, updatedAt: candidate.updatedAt });
    }
  }
  for (const job of syncJobs) {
    const message = job.lastErrorMessage?.trim();
    if (message && (job.state === "retryable-failure" || job.state === "permanent-failure")) {
      failures.push({
        message: displayStoredSyncFailure(message),
        updatedAt: job.updatedAt,
      });
    }
  }
  return (
    failures.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.message ??
    null
  );
}

export function dashboardFailureMessage(
  candidates: Parameters<typeof latestFailureMessage>[0],
  syncJobs: Parameters<typeof latestFailureMessage>[1],
  failedCount: number,
): string | null {
  return (
    latestFailureMessage(candidates, syncJobs) ??
    (failedCount > 0 ? `${failedCount} 项任务失败，旧记录没有错误详情，请点击重试` : null)
  );
}

export async function refreshDashboard(): Promise<DashboardState> {
  try {
    account = await leetcodeClient.getAccountStatus();
    stats =
      account.isSignedIn && account.username
        ? await leetcodeClient.getSolvedStats(account.username)
        : null;
    lastSuccessfulRefreshAt = new Date().toISOString();
    error = null;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "刷新失败";
  }
  return readDashboard();
}

export async function readDashboard(): Promise<DashboardState> {
  const [counts, db, settings] = await Promise.all([
    countCandidateStates(),
    database(),
    readSettings(),
  ]);
  const [dailyActivity, candidates, syncJobs] = await Promise.all([
    db.getAll("dailyActivity"),
    db.getAll("candidates"),
    db.getAll("syncJobs"),
  ]);
  const activityDays = selectRecentActivityDays(dailyActivity).map((day) => ({
    localDate: day.localDate,
    acceptedSubmissionCount: day.acceptedSubmissionCount,
    distinctProblemCount: day.distinctProblemIds.length,
  }));
  const todayLocalDate = localDateForInstant(new Date(), settings.timezone);
  const historyActivity = await db.get("historyActivity", "history-activity");
  const historyError =
    historyActivity?.state === "failed" ? historyActivity.lastError?.trim() : null;
  return {
    account,
    stats,
    activityDays,
    todayLocalDate,
    streakDays: calculateCurrentStreak(dailyActivity, todayLocalDate),
    pendingCount: counts.pending + (historyActivity?.state === "running" ? 1 : 0),
    failedCount: counts.failed,
    lastSuccessfulRefreshAt,
    error: dashboardFailureMessage(candidates, syncJobs, counts.failed) ?? historyError ?? error,
  };
}
