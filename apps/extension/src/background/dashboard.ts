import type { AccountStatus, SolvedStats } from "@leetcode-daily/domain";
import { leetcodeClient } from "./leetcode";

import type { DashboardState } from "../shared/messages";
import { countCandidateStates } from "./database";

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
  const counts = await countCandidateStates();
  return {
    account,
    stats,
    pendingCount: counts.pending,
    failedCount: counts.failed,
    lastSuccessfulRefreshAt,
    error,
  };
}
