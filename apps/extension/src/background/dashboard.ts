import {
  localDateForInstant,
  type AccountStatus,
  type SolvedStats,
} from "@leetcode-daily/domain";
import { leetcodeClient } from "./leetcode";

import type { DashboardState } from "../shared/messages";
import { countCandidateStates, database } from "./database";
import { readSettings } from "./settings";

let account: AccountStatus | null = null;
let stats: SolvedStats | null = null;
let lastSuccessfulRefreshAt: string | null = null;
let error: string | null = null;

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
  const activityDays = (await db.getAll("dailyActivity"))
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
    pendingCount:
      counts.pending + (historyActivity?.state === "running" ? 1 : 0),
    failedCount: counts.failed,
    lastSuccessfulRefreshAt,
    error,
  };
}
