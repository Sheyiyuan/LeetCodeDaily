import { describe, expect, it } from "vitest";

import {
  dashboardFailureMessage,
  latestFailureMessage,
  selectRecentActivityDays,
} from "./dashboard";

describe("dashboard failure reporting", () => {
  it("keeps the sixty activity days required by the popup grid", () => {
    const days = Array.from({ length: 61 }, (_, index) => ({
      localDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    }));

    expect(selectRecentActivityDays(days)).toHaveLength(60);
    expect(selectRecentActivityDays(days)[0]?.localDate).toBe("2026-01-02");
    expect(selectRecentActivityDays(days).at(-1)?.localDate).toBe("2026-03-02");
  });

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

  it("turns legacy GitHub permission errors into actionable guidance", () => {
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
    ).toContain("owner/repository");
  });
});
