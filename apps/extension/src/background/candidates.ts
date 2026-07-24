import {
  aggregateDailyActivity,
  candidateKey,
  LEETCODE_SITE,
  retryDelayMs,
  type SubmissionCandidate,
} from "@leetcode-daily/domain";
import { LeetCodeApiError } from "@leetcode-daily/leetcode-cn";

import { setCompletedBadge, setFailureBadge } from "./badge";
import { syncActivityToCloud } from "./activity-sync";
import { countCandidateStates, database } from "./database";
import { readSettings } from "./settings";
import { enqueueGitHubSync } from "./sync";
import { leetcodeClient } from "./leetcode";

export async function observeAccepted(
  input: Pick<
    SubmissionCandidate,
    "submissionId" | "titleSlug" | "observedAt"
  >,
): Promise<void> {
  const db = await database();
  const key = candidateKey(
    input.titleSlug,
    input.observedAt,
    input.submissionId,
  );
  const existing = await db.get("candidates", key);
  if (existing?.hydrationState === "hydrated") return;

  await db.put("candidates", {
    key,
    site: LEETCODE_SITE,
    submissionId: input.submissionId,
    titleSlug: input.titleSlug,
    observedAt: input.observedAt,
    hydrationState: "pending-hydration",
    attempts: existing?.attempts ?? 0,
    lastError: null,
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  });

  await hydrateCandidate(key);
}

async function hydrateCandidate(key: string): Promise<void> {
  const db = await database();
  const candidate = await db.get("candidates", key);
  if (!candidate) return;

  if (!candidate.submissionId) {
    await db.put("candidates", {
      ...candidate,
      hydrationState: "retryable-failure",
      attempts: candidate.attempts + 1,
      lastError: "暂未获取到 submission ID，请稍后手动重试",
      nextAttemptAt: new Date(
        Date.now() + retryDelayMs(candidate.attempts + 1),
      ).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setFailureBadge();
    return;
  }

  try {
    const submission = await leetcodeClient.getSubmissionDetail(
      candidate.submissionId,
    );
    const problem = await leetcodeClient.getQuestion(submission.titleSlug);
    await db.put("submissions", submission);
    await db.put("candidates", {
      ...candidate,
      hydrationState: "hydrated",
      attempts: candidate.attempts + 1,
      lastError: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    });

    const settings = await readSettings();
    const allSubmissions = await db.getAll("submissions");
    for (const activity of aggregateDailyActivity(
      allSubmissions,
      settings.timezone,
    )) {
      await db.put("dailyActivity", activity);
    }
    await enqueueGitHubSync(submission, problem);
    let activitySyncFailed = false;
    try {
      await syncActivityToCloud();
    } catch {
      activitySyncFailed = true;
    }
    const states = await countCandidateStates();
    if (activitySyncFailed || states.failed > 0) {
      await setFailureBadge();
    } else {
      await setCompletedBadge();
    }
  } catch (cause) {
    const retryable =
      cause instanceof LeetCodeApiError ? cause.retryable : true;
    await db.put("candidates", {
      ...candidate,
      hydrationState: retryable
        ? "retryable-failure"
        : "permanent-failure",
      attempts: candidate.attempts + 1,
      lastError: cause instanceof Error ? cause.message : "详情补全失败",
      nextAttemptAt: retryable
        ? new Date(
            Date.now() + retryDelayMs(candidate.attempts + 1),
          ).toISOString()
        : null,
      updatedAt: new Date().toISOString(),
    });
    await setFailureBadge();
  }
}

export async function retryCandidates(force = false): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  const candidates = await db.getAll("candidates");
  for (const candidate of candidates) {
    if (candidate.hydrationState === "hydrated") continue;
    if (candidate.hydrationState === "permanent-failure" && !force) continue;
    if (!force && candidate.nextAttemptAt && candidate.nextAttemptAt > now) {
      continue;
    }
    await hydrateCandidate(candidate.key);
  }
}
