import { describe, expect, it } from "vitest";

import { retryDelayMs } from ".";

describe("retryDelayMs", () => {
  it("uses capped exponential backoff", () => {
    const options = { jitterRatio: 0, maxMs: 8_000 };
    expect(retryDelayMs(1, options)).toBe(2_000);
    expect(retryDelayMs(2, options)).toBe(4_000);
    expect(retryDelayMs(3, options)).toBe(8_000);
    expect(retryDelayMs(6, options)).toBe(8_000);
  });
});
