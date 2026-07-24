import {
  localDateForInstant,
  type AccountStatus,
  type SolvedStats,
} from "@leetcode-daily/domain";
import type { DashboardState } from "../shared/messages";
import { countCandidateStates, database } from "./database";
import { leetcodeClient } from "./leetcode";
import { readSettings } from "./settings";

let account: AccountStatus | null = null;
let stats: SolvedStats | null = null;
let lastSuccessfulRefreshAt: string | null = null;
let error: string | null = null;

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
  return (
    [
      ...candidates
        .filter(
          (candidate) =>
            (candidate.hydrationState === "retryable-failure" ||
              candidate.hydrationState === "permanent-failure") &&
            candidate.lastError,
        )
        .map((candidate) => ({
          message: candidate.lastError,
          updatedAt: candidate.updatedAt,
        })),
      ...syncJobs
        .filter(
          (job) =>
            (job.state === "retryable-failure" ||
              job.state === "permanent-failure") &&
            job.lastErrorMessage,
        )
        .map((job) => ({
          message: job.lastErrorMessage,
          updatedAt: job.updatedAt,
        })),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
      ?.message ?? null
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
  const activityDays = dailyActivity
    .sort((left, right) => left.localDate.localeCompare(right.localDate))
    .slice(-30)
    .map((day) => ({
      localDate: day.localDate,
      acceptedSubmissionCount: day.acceptedSubmissionCount,
      distinctProblemCount: day.distinctProblemIds.length,
    }));
  const historyActivity = await db.get("historyActivity", "history-activity");
  return {
    account,
    stats,
    activityDays,
    todayLocalDate: localDateForInstant(new Date(), settings.timezone),
    pendingCount: counts.pending + (historyActivity?.state === "running" ? 1 : 0),
    failedCount: counts.failed,
    lastSuccessfulRefreshAt,
    error: latestFailureMessage(candidates, syncJobs) ?? error,
  };
}
