import { describe, expect, it } from "vitest";

import { cleanupExpiredRecords } from "./maintenance";

describe("cleanupExpiredRecords", () => {
  it("removes only expired temporary and session records", async () => {
    const statements: string[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          statements.push(sql);
          return { bind: () => ({ sql }) };
        },
        batch: async () => [],
      },
    } as never;

    await cleanupExpiredRecords(env, new Date("2026-07-24T00:00:00.000Z"));

    expect(statements).toHaveLength(7);
    expect(statements.join("\n")).toContain("DELETE FROM auth_attempts");
    expect(statements.join("\n")).toContain("DELETE FROM auth_grants");
    expect(statements.join("\n")).toContain("DELETE FROM sessions");
    expect(statements.join("\n")).toContain("DELETE FROM api_rate_limits");
    expect(statements.join("\n")).toContain("DELETE FROM activity_sync_batches");
    expect(statements.join("\n")).toContain("DELETE FROM activity_sync_days");
    expect(statements.join("\n")).toContain("DELETE FROM activity_syncs");
  });
});
