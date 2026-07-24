import { describe, expect, it } from "vitest";

import { enforceRateLimit } from "./rate-limit";

function testEnv(count: number) {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return { first: async () => ({ request_count: count }) };
          },
        };
      },
    },
  } as never;
}

describe("enforceRateLimit", () => {
  const request = new Request("https://api.test/v1/activity/days", {
    headers: { "CF-Connecting-IP": "203.0.113.10" },
  });
  const policy = { scope: "activity", limit: 2, windowSeconds: 60 };

  it("allows requests within the route policy", async () => {
    await expect(enforceRateLimit(request, testEnv(2), policy)).resolves.toBeNull();
  });

  it("returns a retryable response over the limit", async () => {
    const response = await enforceRateLimit(request, testEnv(3), policy);

    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThan(0);
    await expect(response?.json()).resolves.toEqual({ error: "rate_limited" });
  });
});
