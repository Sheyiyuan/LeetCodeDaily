import {
  retryDelayMs,
  type Problem,
  type Submission,
} from "@leetcode-daily/domain";
import {
  GitHubAtomicCommitClient,
  GitHubSyncError,
  type CommitFile,
} from "@leetcode-daily/github-sync";
import {
  generateProblemReadme,
  generateSolutionFile,
} from "@leetcode-daily/problem-markdown";

import { githubAccessToken } from "./auth";
import { setFailureBadge } from "./badge";
import { database, type StoredSyncJob } from "./database";
import { readSettings } from "./settings";

function safeSegment(value: string): string {
  const normalized = value.trim().replaceAll(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.replaceAll(/^-+|-+$/g, "");
}

function joinPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .map(safeSegment)
    .filter(Boolean)
    .join("/");
}

export function hasEquivalentSyncJob(
  jobs: Array<
    Pick<
      StoredSyncJob,
      | "owner"
      | "repository"
      | "branch"
      | "targetPath"
      | "desiredContentHash"
      | "state"
    >
  >,
  input: Pick<
    StoredSyncJob,
    "owner" | "repository" | "branch" | "targetPath" | "desiredContentHash"
  >,
): boolean {
  return jobs.some(
    (job) =>
      job.owner === input.owner &&
      job.repository === input.repository &&
      job.branch === input.branch &&
      job.targetPath === input.targetPath &&
      job.desiredContentHash === input.desiredContentHash &&
      job.state !== "permanent-failure",
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isPermanentSyncInputError(cause: unknown): boolean {
  if (!(cause instanceof TypeError)) return false;
  return /^(owner, repository and branch are required|commit message is required|at least one file is required|unsafe repository path:|duplicate repository path:)/.test(
    cause.message,
  );
}

export async function enqueueGitHubSync(
  submission: Submission,
  problem: Problem,
): Promise<void> {
  const settings = await readSettings();
  if (!settings.githubRepository) return;

  const [owner, repository, ...rest] = settings.githubRepository.split("/");
  if (!owner || !repository || rest.length > 0) {
    throw new TypeError("GitHub 仓库必须使用 owner/repository 格式");
  }

  const db = await database();
  const existingJobs = await db.getAll("syncJobs");
  const solutions = (await db.getAll("submissions"))
    .filter((item) => item.frontendId === submission.frontendId)
    .map((item) => ({
      language: item.language,
      submissionId: item.submissionId,
      submittedAt: item.submittedAt,
    }));
  const readme = generateProblemReadme({
    problem,
    solutions,
    includeProblemContent: settings.includeProblemContent,
  });
  const solution = generateSolutionFile(
    {
      language: submission.language,
      problemUrl: problem.canonicalUrl,
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
    },
    submission.code,
  );
  const directory = joinPath(
    settings.githubRootDirectory,
    `${problem.frontendId}-${problem.titleSlug}`,
  );
  const files: CommitFile[] = [
    { path: `${directory}/README.md`, content: readme },
    { path: `${directory}/${solution.fileName}`, content: solution.content },
  ];
  const desiredContentHash = await sha256(
    files.map((file) => `${file.path}\0${file.content}`).join("\0"),
  );
  if (
    hasEquivalentSyncJob(existingJobs, {
      owner,
      repository,
      branch: settings.githubBranch,
      targetPath: directory,
      desiredContentHash,
    })
  ) {
    return;
  }
  const now = new Date().toISOString();
  const job: StoredSyncJob = {
    id: `sync:${submission.key}`,
    submissionKey: submission.key,
    owner,
    repository,
    branch: settings.githubBranch,
    targetPath: directory,
    desiredContentHash,
    state: "pending",
    attempts: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    message: `solve: ${problem.frontendId} ${problem.titleSlug} (${submission.language})`,
    files,
  };
  await db.put("syncJobs", job);
  await runSyncJob(job.id);
}

export async function runSyncJob(jobId: string): Promise<void> {
  const db = await database();
  const job = await db.get("syncJobs", jobId);
  if (!job || job.state === "succeeded") return;

  const syncing: StoredSyncJob = {
    ...job,
    state: "syncing",
    attempts: job.attempts + 1,
    updatedAt: new Date().toISOString(),
  };
  await db.put("syncJobs", syncing);

  try {
    const token = await githubAccessToken();
    if (!token) throw new Error("GitHub access token unavailable");
    const client = new GitHubAtomicCommitClient({ token });
    await client.commitFiles({
      owner: job.owner,
      repository: job.repository,
      branch: job.branch,
      message: job.message,
      files: job.files,
    });
    await db.put("syncJobs", {
      ...syncing,
      state: "succeeded",
      lastErrorCode: null,
      lastErrorMessage: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (cause) {
    const permanentInputError = isPermanentSyncInputError(cause);
    const retryable = cause instanceof GitHubSyncError ? cause.retryable : !permanentInputError;
    await db.put("syncJobs", {
      ...syncing,
      state: retryable ? "retryable-failure" : "permanent-failure",
      lastErrorCode:
        cause instanceof GitHubSyncError
          ? `GITHUB_HTTP_${cause.status}`
          : cause instanceof TypeError
            ? "INVALID_SYNC_INPUT"
            : "GITHUB_COMMIT_FAILED",
      lastErrorMessage:
        cause instanceof Error ? cause.message : "GitHub 提交失败",
      nextAttemptAt: retryable
        ? new Date(
            Date.now() + retryDelayMs(syncing.attempts),
          ).toISOString()
        : null,
      updatedAt: new Date().toISOString(),
    });
    await setFailureBadge();
  }
}

export async function retrySyncJobs(force = false): Promise<void> {
  const db = await database();
  const now = new Date().toISOString();
  const jobs = await db.getAll("syncJobs");
  for (const job of jobs) {
    if (!shouldRetrySyncJob(job, now, force)) continue;
    await runSyncJob(job.id);
  }
}

const STALE_SYNCING_MS = 5 * 60 * 1_000;

export function shouldRetrySyncJob(
  job: Pick<StoredSyncJob, "state" | "updatedAt" | "nextAttemptAt">,
  now: string,
  force: boolean,
): boolean {
  if (job.state === "succeeded") return false;
  if (job.state === "permanent-failure") return force;
  if (job.state === "syncing") {
    return (
      Date.parse(now) - Date.parse(job.updatedAt) >= STALE_SYNCING_MS
    );
  }
  return force || !job.nextAttemptAt || job.nextAttemptAt <= now;
}
