import type { AcceptedSubmissionSummary } from "@leetcode-daily/leetcode-cn";
import { describe, expect, it } from "vitest";

import {
  candidateAlreadyProcessed,
  recentSubmissionIdForCandidate,
} from "./candidates";

function submission(
  id: string,
  timestamp: string,
  titleSlug = "two-sum",
): AcceptedSubmissionSummary {
  return {
    id,
    titleSlug,
    language: "typescript",
    timestamp: Date.parse(timestamp) / 1_000,
  };
}

describe("recentSubmissionIdForCandidate", () => {
  it("selects the newest nearby submission and excludes the pre-click id", () => {
    expect(
      recentSubmissionIdForCandidate(
        [
          submission("100", "2026-07-24T09:59:20.000Z"),
          submission("102", "2026-07-24T09:59:50.000Z"),
          submission("101", "2026-07-24T09:59:40.000Z"),
        ],
        {
          titleSlug: "two-sum",
          observedAt: "2026-07-24T10:00:00.000Z",
          previousSubmissionId: "102",
        },
        new Set(["100"]),
      ),
    ).toBe("101");
  });

  it("ignores another problem and submissions outside the observation window", () => {
    expect(
      recentSubmissionIdForCandidate(
        [
          submission("100", "2026-07-24T09:50:00.000Z"),
          submission("101", "2026-07-24T09:59:50.000Z", "three-sum"),
          submission("102", "2026-07-24T10:02:00.000Z"),
        ],
        {
          titleSlug: "two-sum",
          observedAt: "2026-07-24T10:00:00.000Z",
          previousSubmissionId: null,
        },
      ),
    ).toBeNull();
  });

  it("recognizes a duplicate candidate whose nearby Accepted was already processed", () => {
    const recent = [submission("103", "2026-07-24T09:59:50.000Z")];
    const candidate = {
      titleSlug: "two-sum",
      observedAt: "2026-07-24T10:00:00.000Z",
      previousSubmissionId: "102",
    };

    expect(
      candidateAlreadyProcessed(recent, candidate, new Set(["103"])),
    ).toBe(true);
    expect(
      candidateAlreadyProcessed(recent, candidate, new Set()),
    ).toBe(false);
  });
});
