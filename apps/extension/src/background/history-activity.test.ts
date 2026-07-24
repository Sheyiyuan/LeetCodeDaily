import { describe, expect, it } from "vitest";

import { historyActivityRetryDelayMs } from "./history-activity";

describe("historyActivityRetryDelayMs", () => {
  it("backs off exponentially and caps retries at fifteen minutes", () => {
    expect(historyActivityRetryDelayMs(1)).toBe(60_000);
    expect(historyActivityRetryDelayMs(2)).toBe(120_000);
    expect(historyActivityRetryDelayMs(10)).toBe(15 * 60_000);
  });
});
