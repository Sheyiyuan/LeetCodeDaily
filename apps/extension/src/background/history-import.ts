import {
  GitHubAtomicCommitClient,
  GitHubSyncError,
  type CommitFile,
} from "@leetcode-daily/github-sync";
import {
  generateProblemReadme,
  generateSolutionFile,
} from "@leetcode-daily/problem-markdown";
import {
  latestAcceptedByLanguage,
  LeetCodeApiError,
} from "@leetcode-daily/leetcode-cn";

import type { HistoryImportStatus } from "../shared/messages";
import { syncActivityToCloud } from "./activity-sync";
import { rebuildDailyActivity } from "./activity-ledger";
import { githubAccessToken } from "./auth";
import { setFailureBadge } from "./badge";
import { database, type StoredHistoryImport } from "./database";
import { leetcodeClient } from "./leetcode";
import { readSettings } from "./settings";

export const HISTORY_IMPORT_ALARM = "history-import-work";
const IMPORT_ID = "history-import";
const BATCH_SIZE = 20;
const PROBLEMS_PER_WAKE = 2;
let activeRun: Promise<void> | null = null;

function safeSegment(value: string): string {
  return value
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function joinPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .map(safeSegment)
    .filter(Boolean)
    .join("/");
}

export function historyImportStatus(
  job: StoredHistoryImport | undefined,
): HistoryImportStatus {
  if (!job) {
    return {
      state: "idle",
      totalProblems: 0,
      processedProblems: 0,
      importedProblems: 0,
      failedProblems: 0,
      failures: [],
      currentTitleSlug: null,
      lastError: null,
      startedAt: null,
      updatedAt: null,
    };
  }
  return {
    state: job.state,
    totalProblems: job.problemSlugs.length,
    processedProblems: job.nextIndex,
    importedProblems: job.importedProblems,
    failedProblems: job.failures.length,
    failures: job.failures,
    currentTitleSlug: job.currentTitleSlug,
    lastError: job.lastError,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

export async function readHistoryImport(): Promise<HistoryImportStatus> {
  return historyImportStatus(
    await (await database()).get("historyImport", IMPORT_ID),
  );
}

export async function startHistoryImport(): Promise<HistoryImportStatus> {
  const settings = await readSettings();
  if (!settings.githubRepository) throw new Error("请先选择 GitHub 仓库");
  const [owner, repository, ...rest] = settings.githubRepository.split("/");
  if (!owner || !repository || rest.length > 0) {
    throw new Error("GitHub 仓库格式无效");
  }
  if (!(await githubAccessToken())) throw new Error("请先连接 GitHub");

  const db = await database();
  const existing = await db.get("historyImport", IMPORT_ID);
  if (existing?.state === "running" || existing?.state === "paused") {
    return historyImportStatus(existing);
  }

  const problems = await leetcodeClient.getSolvedProblems();
  const now = new Date().toISOString();
  const job: StoredHistoryImport = {
    id: IMPORT_ID,
    state: "running",
    problemSlugs: problems,
    nextIndex: 0,
    importedProblems: 0,
    failures: [],
    pendingFiles: [],
    pendingProblemCount: 0,
    owner,
    repository,
    branch: settings.githubBranch,
    rootDirectory: settings.githubRootDirectory,
    currentTitleSlug: null,
    lastError: null,
    nextAttemptAt: null,
    startedAt: now,
    updatedAt: now,
  };
  await db.put("historyImport", job);
  await scheduleHistoryImport();
  return historyImportStatus(job);
}

export async function pauseHistoryImport(): Promise<HistoryImportStatus> {
  return updateState("paused");
}

export async function resumeHistoryImport(): Promise<HistoryImportStatus> {
  const status = await updateState("running");
  await scheduleHistoryImport();
  return status;
}

export async function cancelHistoryImport(): Promise<HistoryImportStatus> {
  const db = await database();
  const job = await db.get("historyImport", IMPORT_ID);
  if (!job) return historyImportStatus(undefined);
  const updated: StoredHistoryImport = {
    ...job,
    state: "cancelled",
    currentTitleSlug: null,
    pendingFiles: [],
    pendingProblemCount: 0,
    updatedAt: new Date().toISOString(),
  };
  await db.put("historyImport", updated);
  await chrome.alarms.clear(HISTORY_IMPORT_ALARM);
  return historyImportStatus(updated);
}

async function updateState(
  state: "running" | "paused",
): Promise<HistoryImportStatus> {
  const db = await database();
  const job = await db.get("historyImport", IMPORT_ID);
  if (!job) throw new Error("没有可继续的历史导入任务");
  if (job.state === "completed" || job.state === "cancelled") {
    throw new Error("当前历史导入任务已经结束");
  }
  const updated = {
    ...job,
    state,
    lastError: state === "running" ? null : job.lastError,
    nextAttemptAt: state === "running" ? null : job.nextAttemptAt,
    updatedAt: new Date().toISOString(),
  } satisfies StoredHistoryImport;
  await db.put("historyImport", updated);
  if (state === "paused") await chrome.alarms.clear(HISTORY_IMPORT_ALARM);
  return historyImportStatus(updated);
}

export async function scheduleHistoryImport(delayMs = 1_000): Promise<void> {
  await chrome.alarms.create(HISTORY_IMPORT_ALARM, {
    when: Date.now() + delayMs,
  });
}

export async function runHistoryImport(): Promise<void> {
  activeRun ??= runHistoryImportChunk().finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function runHistoryImportChunk(): Promise<void> {
  const initial = await (await database()).get("historyImport", IMPORT_ID);
  if (!initial || initial.state !== "running") return;
  // Keep a recovery alarm alive if the service worker is stopped mid-request.
  await scheduleHistoryImport(60_000);

  for (let count = 0; count < PROBLEMS_PER_WAKE; count += 1) {
    const db = await database();
    const job = await db.get("historyImport", IMPORT_ID);
    if (!job || job.state !== "running") return;
    if (job.nextAttemptAt && job.nextAttemptAt > new Date().toISOString()) {
      await scheduleHistoryImport(
        Math.max(1_000, Date.parse(job.nextAttemptAt) - Date.now()),
      );
      return;
    }

    if (job.nextIndex >= job.problemSlugs.length) {
      if (job.pendingProblemCount > 0) await commitPendingBatch(job);
      else await completeImport();
      return;
    }

    await processProblem(job);
  }

  const current = await (await database()).get("historyImport", IMPORT_ID);
  if (current?.state === "running") await scheduleHistoryImport(2_000);
}

async function processProblem(job: StoredHistoryImport): Promise<void> {
  const problemSummary = job.problemSlugs[job.nextIndex];
  if (!problemSummary) return;
  const db = await database();
  await db.put("historyImport", {
    ...job,
    currentTitleSlug: problemSummary.titleSlug,
    updatedAt: new Date().toISOString(),
  });

  try {
    const acceptedSummaries = await leetcodeClient.getAcceptedSubmissions(
      problemSummary.titleSlug,
    );
    const summaries = latestAcceptedByLanguage(acceptedSummaries);
    if (summaries.length === 0) throw new Error("未找到 Accepted 提交");
    const statusBeforeDetails = await db.get("historyImport", IMPORT_ID);
    if (!statusBeforeDetails || statusBeforeDetails.state === "cancelled") return;
    const historicalTransaction = db.transaction(
      "historicalAccepted",
      "readwrite",
    );
    for (const summary of acceptedSummaries) {
      await historicalTransaction.store.put({
        submissionId: summary.id,
        problemId: problemSummary.questionId,
        submittedAt: new Date(summary.timestamp * 1_000).toISOString(),
      });
    }
    await historicalTransaction.done;

    const [problem, submissions] = await Promise.all([
      leetcodeClient.getQuestion(problemSummary.titleSlug),
      Promise.all(
        summaries.map((submission) =>
          leetcodeClient.getSubmissionDetail(submission.id),
        ),
      ),
    ]);
    const directory = joinPath(
      job.rootDirectory,
      `${problem.frontendId}-${problem.titleSlug}`,
    );
    const files: CommitFile[] = [
      {
        path: `${directory}/README.md`,
        content: generateProblemReadme({
          problem,
          solutions: submissions.map((submission) => ({
            language: submission.language,
            submissionId: submission.submissionId,
            submittedAt: submission.submittedAt,
          })),
        }),
      },
      ...submissions.map((submission) => {
        const solution = generateSolutionFile(
          {
            language: submission.language,
            problemUrl: problem.canonicalUrl,
            submissionId: submission.submissionId,
            submittedAt: submission.submittedAt,
          },
          submission.code,
        );
        return {
          path: `${directory}/${solution.fileName}`,
          content: solution.content,
        };
      }),
    ];

    const current = await db.get("historyImport", IMPORT_ID);
    if (!current || current.state === "cancelled") return;
    const transaction = db.transaction("submissions", "readwrite");
    for (const submission of submissions) {
      await transaction.store.put(submission);
    }
    await transaction.done;
    const updated: StoredHistoryImport = {
      ...current,
      nextIndex: current.nextIndex + 1,
      pendingFiles: [...current.pendingFiles, ...files],
      pendingProblemCount: current.pendingProblemCount + 1,
      currentTitleSlug: null,
      lastError: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    };
    await db.put("historyImport", updated);
    if (
      updated.state === "running" &&
      updated.pendingProblemCount >= BATCH_SIZE
    ) {
      await commitPendingBatch(updated);
    }
  } catch (cause) {
    const current = await db.get("historyImport", IMPORT_ID);
    if (!current || current.state === "cancelled") return;
    const message = cause instanceof Error ? cause.message : "历史题解读取失败";
    if (cause instanceof LeetCodeApiError && cause.code === "SIGNED_OUT") {
      await failImport(message);
      return;
    }
    await db.put("historyImport", {
      ...current,
      nextIndex: current.nextIndex + 1,
      failures: [
        ...current.failures,
        { titleSlug: problemSummary.titleSlug, message },
      ],
      currentTitleSlug: null,
      lastError: message,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function commitPendingBatch(job: StoredHistoryImport): Promise<void> {
  const token = await githubAccessToken();
  if (!token) {
    await failImport("GitHub 会话已失效，请重新连接后继续");
    return;
  }

  try {
    const client = new GitHubAtomicCommitClient({ token });
    await client.commitFiles({
      owner: job.owner,
      repository: job.repository,
      branch: job.branch,
      message: `import: ${job.pendingProblemCount} LeetCode solutions`,
      files: job.pendingFiles,
    });
    const db = await database();
    const current = await db.get("historyImport", IMPORT_ID);
    if (!current || current.state === "cancelled") return;
    const updated: StoredHistoryImport = {
      ...current,
      importedProblems: current.importedProblems + current.pendingProblemCount,
      pendingFiles: [],
      pendingProblemCount: 0,
      lastError: null,
      nextAttemptAt: null,
      updatedAt: new Date().toISOString(),
    };
    await db.put("historyImport", updated);
    await rebuildActivity();
    if (updated.nextIndex >= updated.problemSlugs.length) {
      await completeImport();
    }
  } catch (cause) {
    const retryable =
      cause instanceof GitHubSyncError ? cause.retryable : true;
    const message = cause instanceof Error ? cause.message : "GitHub 历史导入失败";
    if (retryable) {
      const db = await database();
      const current = await db.get("historyImport", IMPORT_ID);
      if (!current || current.state === "cancelled") return;
      await db.put("historyImport", {
        ...current,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setFailureBadge();
      if (current.state === "running") {
        await scheduleHistoryImport(60_000);
      }
    } else {
      await failImport(message);
    }
  }
}

async function rebuildActivity(): Promise<void> {
  await rebuildDailyActivity();
  await syncActivityToCloud().catch(() => undefined);
}

async function completeImport(): Promise<void> {
  const db = await database();
  const current = await db.get("historyImport", IMPORT_ID);
  if (!current || current.state === "cancelled") return;
  await db.put("historyImport", {
    ...current,
    state: "completed",
    currentTitleSlug: null,
    lastError: current.failures.length > 0 ? current.lastError : null,
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  });
  await rebuildActivity();
  await chrome.alarms.clear(HISTORY_IMPORT_ALARM);
}

async function failImport(message: string): Promise<void> {
  const db = await database();
  const current = await db.get("historyImport", IMPORT_ID);
  if (!current || current.state === "cancelled") return;
  await db.put("historyImport", {
    ...current,
    state: "failed",
    currentTitleSlug: null,
    lastError: message,
    nextAttemptAt: null,
    updatedAt: new Date().toISOString(),
  });
  await setFailureBadge();
  await chrome.alarms.clear(HISTORY_IMPORT_ALARM);
}
