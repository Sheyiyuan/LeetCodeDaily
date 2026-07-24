import { describe, expect, it } from "vitest";

import {
  hasEquivalentSyncJob,
  isFailureFixedByCurrentVersion,
  isPermanentSyncInputError,
  shouldRetrySyncJob,
} from "./sync";

describe("sync error classification", () => {
  it("keeps Worker fetch invocation errors retryable", () => {
    expect(isPermanentSyncInputError(new TypeError("Illegal invocation"))).toBe(false);
    expect(isPermanentSyncInputError(new TypeError("unsafe repository path: ../README.md"))).toBe(
      true,
    );
  });
});

describe("hasEquivalentSyncJob", () => {
  it("detects an existing job with the same target and content hash", () => {
    expect(
      hasEquivalentSyncJob(
        [
          {
            owner: "octocat",
            repository: "leetcode",
            branch: "main",
            targetPath: "solutions/1-two-sum",
            desiredContentHash: "hash-1",
            state: "pending",
          },
        ],
        {
          owner: "octocat",
          repository: "leetcode",
          branch: "main",
          targetPath: "solutions/1-two-sum",
          desiredContentHash: "hash-1",
        },
      ),
    ).toBe(true);
  });

  it("ignores jobs with different content or a different repository target", () => {
    expect(
      hasEquivalentSyncJob(
        [
          {
            owner: "octocat",
            repository: "leetcode",
            branch: "main",
            targetPath: "solutions/1-two-sum",
            desiredContentHash: "hash-1",
            state: "pending",
          },
        ],
        {
          owner: "octocat",
          repository: "leetcode",
          branch: "main",
          targetPath: "solutions/1-two-sum",
          desiredContentHash: "hash-2",
        },
      ),
    ).toBe(false);
  });
});

describe("shouldRetrySyncJob", () => {
  const now = "2026-07-24T10:00:00.000Z";

  it("recovers a syncing job that has been abandoned for five minutes", () => {
    expect(
      shouldRetrySyncJob(
        {
          state: "syncing",
          updatedAt: "2026-07-24T09:54:59.000Z",
          nextAttemptAt: null,
        },
        now,
        false,
      ),
    ).toBe(true);
    expect(
      shouldRetrySyncJob(
        {
          state: "syncing",
          updatedAt: "2026-07-24T09:58:00.000Z",
          nextAttemptAt: null,
        },
        now,
        false,
      ),
    ).toBe(false);
  });

  it("only retries permanent failures when the user forces a retry", () => {
    const job = {
      state: "permanent-failure" as const,
      updatedAt: now,
      nextAttemptAt: null,
    };
    expect(shouldRetrySyncJob(job, now, false)).toBe(false);
    expect(shouldRetrySyncJob(job, now, true)).toBe(true);
  });

  it("waits until a retryable job reaches its next attempt time", () => {
    expect(
      shouldRetrySyncJob(
        {
          state: "retryable-failure",
          updatedAt: now,
          nextAttemptAt: "2026-07-24T10:01:00.000Z",
        },
        now,
        false,
      ),
    ).toBe(false);
  });

  it("immediately retries failures whose implementation bug is now fixed", () => {
    expect(
      shouldRetrySyncJob(
        {
          state: "permanent-failure",
          updatedAt: now,
          nextAttemptAt: null,
          lastErrorMessage:
            "Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation",
        },
        now,
        false,
      ),
    ).toBe(true);
    expect(
      shouldRetrySyncJob(
        {
          state: "retryable-failure",
          updatedAt: now,
          nextAttemptAt: "2026-07-25T10:00:00.000Z",
          lastErrorMessage: "Git Repository is empty.",
        },
        now,
        false,
      ),
    ).toBe(true);
  });
});

describe("isFailureFixedByCurrentVersion", () => {
  it("does not auto-retry unrelated permanent input errors", () => {
    expect(
      isFailureFixedByCurrentVersion({
        state: "permanent-failure",
        lastErrorMessage: "unsafe repository path: ../README.md",
      }),
    ).toBe(false);
  });
});
