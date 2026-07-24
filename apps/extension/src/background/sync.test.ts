import { describe, expect, it } from "vitest";

import { hasEquivalentSyncJob } from "./sync";

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
