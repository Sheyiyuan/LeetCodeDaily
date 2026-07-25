import {
  candidateKey,
  LEETCODE_SITE,
  retryDelayMs,
  submissionKey,
  type SubmissionCandidate,
} from "@leetcode-daily/domain";
import {
  LeetCodeApiError,
  type AcceptedSubmissionSummary,
} from "@leetcode-daily/leetcode-cn";

import { setCompletedBadge, setFailureBadge, setStreakBadge } from "./badge";
import { syncActivityToCloud } from "./activity-sync";
import { rebuildDailyActivity } from "./activity-ledger";
import { countCandidateStates, database } from "./database";
import { enqueueGitHubSync } from "./sync";
import { leetcodeClient } from "./leetcode";

export async function observeAccepted(
  input: Pick<
    SubmissionCandidate,
    | "submissionId"
    | "previousSubmissionId"
    | "titleSlug"
    | "observedAt"
  >,
): Promise<void> {
  const db = await database();
  const key = candidateKey(
    input.titleSlug,
    input.observedAt,
    input.submissionId,
  );
  if (
    input.submissionId &&
    (await db.get("submissions", submissionKey(input.submissionId)))
  ) {
    return;
  }
  const existing = await db.get("candidates", key);
  if (existing?.hydrationState === "hydrated") return;

  await db.put("candidates", {
    key,
    site: LEETCODE_SITE,
    submissionId: input.submissionId,
    ...(input.previousSubmissionId !== undefined
      ? { previousSubmissionId: input.previousSubmissionId }
      : {}),
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
  let candidate = await db.get("candidates", key);
  if (!candidate) return;

  try {
    if (!candidate.submissionId) {
      const recent = await leetcodeClient.getRecentAcceptedSubmissions(
        candidate.titleSlug,
      );
      const knownSubmissionIds = new Set(
        (await db.getAll("submissions")).map(
          (submission) => submission.submissionId,
        ),
      );
      const submissionId = recentSubmissionIdForCandidate(
        recent,
        candidate,
        knownSubmissionIds,
      );
      if (!submissionId) {
        if (
          candidateAlreadyProcessed(
            recent,
            candidate,
            knownSubmissionIds,
          )
        ) {
          await db.put("candidates", {
            ...candidate,
            hydrationState: "hydrated",
            attempts: candidate.attempts + 1,
            lastError: null,
            nextAttemptAt: null,
            updatedAt: new Date().toISOString(),
          });
          return;
        }
        throw new Error("最近提交列表中尚未出现本次 Accepted");
      }
      candidate = { ...candidate, submissionId };
      await db.put("candidates", candidate);
    }

    const submissionId = candidate.submissionId;
    if (!submissionId) throw new Error("未能解析 submission ID");
    const submission = await leetcodeClient.getSubmissionDetail(
      submissionId,
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

    await rebuildDailyActivity();
    const githubSynced = await enqueueGitHubSync(submission, problem);
    let activitySyncFailed = false;
    try {
      await syncActivityToCloud();
    } catch {
      activitySyncFailed = true;
    }
    const states = await countCandidateStates();
    if (activitySyncFailed || states.failed > 0) {
      await setFailureBadge();
    } else if (githubSynced) {
      await setCompletedBadge();
    } else {
      await setStreakBadge();
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
      lastError: errorMessage(cause, "详情补全失败"),
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

const CANDIDATE_LOOKBACK_MS = 5 * 60 * 1_000;
const CANDIDATE_CLOCK_SKEW_MS = 60 * 1_000;

function candidateSubmissionsInWindow(
  submissions: AcceptedSubmissionSummary[],
  candidate: Pick<
    SubmissionCandidate,
    "titleSlug" | "observedAt" | "previousSubmissionId"
  >,
): AcceptedSubmissionSummary[] {
  const observedAt = Date.parse(candidate.observedAt);
  if (!Number.isFinite(observedAt)) return [];
  return submissions.filter((submission) => {
    const submittedAt = submission.timestamp * 1_000;
    return (
      submission.titleSlug === candidate.titleSlug &&
      submission.id !== candidate.previousSubmissionId &&
      submittedAt >= observedAt - CANDIDATE_LOOKBACK_MS &&
      submittedAt <= observedAt + CANDIDATE_CLOCK_SKEW_MS
    );
  });
}

export function candidateAlreadyProcessed(
  submissions: AcceptedSubmissionSummary[],
  candidate: Pick<
    SubmissionCandidate,
    "titleSlug" | "observedAt" | "previousSubmissionId"
  >,
  knownSubmissionIds: ReadonlySet<string>,
): boolean {
  const matching = candidateSubmissionsInWindow(submissions, candidate);
  return (
    matching.length > 0 &&
    matching.every((submission) => knownSubmissionIds.has(submission.id))
  );
}

export function recentSubmissionIdForCandidate(
  submissions: AcceptedSubmissionSummary[],
  candidate: Pick<
    SubmissionCandidate,
    "titleSlug" | "observedAt" | "previousSubmissionId"
  >,
  knownSubmissionIds: ReadonlySet<string> = new Set(),
): string | null {
  return (
    candidateSubmissionsInWindow(submissions, candidate)
      .filter((submission) => !knownSubmissionIds.has(submission.id))
      .sort(
        (left, right) =>
          right.timestamp - left.timestamp || right.id.localeCompare(left.id),
      )[0]?.id ?? null
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  return cause.message.trim() || fallback;
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
