import { describe, expect, it } from "vitest";

import { dashboardFailureMessage, latestFailureMessage } from "./dashboard";

describe("dashboard failure reporting", () => {
  it("returns the most recently updated candidate or sync error", () => {
    expect(
      latestFailureMessage(
        [
          {
            hydrationState: "retryable-failure",
            lastError: "LeetCode 请求失败",
            updatedAt: "2026-07-24T10:00:00.000Z",
          },
        ],
        [
          {
            state: "retryable-failure",
            lastErrorMessage: "GitHub access token unavailable",
            updatedAt: "2026-07-24T10:01:00.000Z",
          },
        ],
      ),
    ).toBe("GitHub access token unavailable");
  });

  it("ignores successful records and failures without a message", () => {
    expect(
      latestFailureMessage(
        [
          {
            hydrationState: "hydrated",
            lastError: null,
            updatedAt: "2026-07-24T10:02:00.000Z",
          },
        ],
        [
          {
            state: "permanent-failure",
            lastErrorMessage: "   ",
            updatedAt: "2026-07-24T10:03:00.000Z",
          },
        ],
      ),
    ).toBeNull();
  });

  it("always gives legacy failures a visible fallback message", () => {
    expect(
      dashboardFailureMessage(
        [],
        [
          {
            state: "permanent-failure",
            lastErrorMessage: null,
            updatedAt: "2026-07-24T10:03:00.000Z",
          },
        ],
        3,
      ),
    ).toBe("3 项任务失败，旧记录没有错误详情，请点击重试");
  });

  it("turns legacy GitHub App permission errors into actionable guidance", () => {
    expect(
      latestFailureMessage(
        [],
        [
          {
            state: "permanent-failure",
            lastErrorMessage: "Resource not accessible by integration",
            updatedAt: "2026-07-24T10:03:00.000Z",
          },
        ],
      ),
    ).toContain("Contents 设为 Read and write");
  });
});
