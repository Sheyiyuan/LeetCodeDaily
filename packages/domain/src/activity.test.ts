import { describe, expect, it } from "vitest";

import { activityLevel, aggregateDailyActivity, localDateForInstant } from ".";
import type { Submission } from ".";

function submission(
  id: string,
  problemId: string,
  submittedAt: string,
): Submission {
  return {
    key: `leetcode.cn:${id}`,
    site: "leetcode.cn",
    submissionId: id,
    problemId,
    frontendId: problemId,
    titleSlug: `problem-${problemId}`,
    status: "Accepted",
    language: "typescript",
    submittedAt,
    code: "return true;",
  };
}

describe("localDateForInstant", () => {
  it("uses the configured timezone instead of UTC", () => {
    expect(localDateForInstant("2026-07-24T16:30:00.000Z", "Asia/Shanghai")).toBe(
      "2026-07-25",
    );
    expect(localDateForInstant("2026-07-24T16:30:00.000Z", "UTC")).toBe(
      "2026-07-24",
    );
  });
});

describe("aggregateDailyActivity", () => {
  it("deduplicates submission ids and distinct problems independently", () => {
    const result = aggregateDailyActivity(
      [
        submission("10", "1", "2026-07-24T01:00:00.000Z"),
        submission("10", "1", "2026-07-24T01:00:00.000Z"),
        submission("11", "1", "2026-07-24T02:00:00.000Z"),
        submission("12", "2", "2026-07-24T03:00:00.000Z"),
      ],
      "Asia/Shanghai",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.acceptedSubmissionCount).toBe(3);
    expect(result[0]?.distinctProblemIds).toEqual(["1", "2"]);
  });
});

describe("activityLevel", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [5, 4],
  ])("maps %i problems to level %i", (count, level) => {
    expect(activityLevel(count)).toBe(level);
  });
});
