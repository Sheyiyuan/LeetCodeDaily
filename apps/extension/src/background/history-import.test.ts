import { describe, expect, it } from "vitest";

import { historyImportStatus } from "./history-import";

describe("historyImportStatus", () => {
  it("returns an idle status before the first import", () => {
    expect(historyImportStatus(undefined)).toEqual({
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
    });
  });

  it("projects persisted progress without exposing code or repository details", () => {
    expect(
      historyImportStatus({
        id: "history-import",
        state: "running",
        problemSlugs: [
          { questionId: "1", frontendId: "1", titleSlug: "two-sum" },
          { questionId: "2", frontendId: "2", titleSlug: "add-two-numbers" },
        ],
        nextIndex: 1,
        importedProblems: 1,
        failures: [],
        pendingFiles: [],
        pendingProblemCount: 0,
        owner: "octocat",
        repository: "solutions",
        branch: "main",
        rootDirectory: "solutions",
        currentTitleSlug: "add-two-numbers",
        lastError: null,
        nextAttemptAt: null,
        startedAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:01:00.000Z",
      }),
    ).toMatchObject({
      state: "running",
      totalProblems: 2,
      processedProblems: 1,
      importedProblems: 1,
      failedProblems: 0,
      failures: [],
      currentTitleSlug: "add-two-numbers",
    });
  });
});
