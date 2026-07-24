import { describe, expect, it } from "vitest";

import { parseActivityPayload, putActivity } from "./activity";

const day = {
  localDate: "2026-07-24",
  acceptedSubmissionCount: 2,
  distinctProblemCount: 1,
};

describe("parseActivityPayload", () => {
  it("accepts legacy activity uploads", () => {
    expect(
      parseActivityPayload({
        sourceVersion: 1,
        timezone: "Asia/Shanghai",
        days: [day],
      }),
    ).toMatchObject({ timezone: "Asia/Shanghai", days: [day] });
  });

  it("accepts complete snapshot metadata", () => {
    expect(
      parseActivityPayload({
        sourceVersion: 1,
        timezone: "Asia/Shanghai",
        syncId: "00000000-0000-4000-8000-000000000001",
        batchIndex: 1,
        batchCount: 2,
        days: [day],
      }),
    ).toMatchObject({ batchIndex: 1, batchCount: 2 });
  });

  it("rejects partial or invalid snapshot metadata", () => {
    expect(
      parseActivityPayload({
        sourceVersion: 1,
        timezone: "Asia/Shanghai",
        syncId: "not-a-uuid",
        days: [day],
      }),
    ).toBeNull();
    expect(
      parseActivityPayload({
        sourceVersion: 1,
        timezone: "Asia/Shanghai",
        syncId: "00000000-0000-4000-8000-000000000001",
        batchIndex: 0,
        batchCount: 1_001,
        days: [day],
      }),
    ).toBeNull();
    expect(
      parseActivityPayload({
        sourceVersion: 1,
        timezone: "Asia/Shanghai",
        syncId: "00000000-0000-4000-8000-000000000001",
        batchIndex: 2,
        batchCount: 2,
        days: [day],
      }),
    ).toBeNull();
  });
});

describe("putActivity snapshot flow", () => {
  it("authenticates, stages the batch, then atomically replaces activity", async () => {
    const batches: string[][] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          const statement = {
            sql,
            bind() {
              return statement;
            },
            async first() {
              if (sql.includes("FROM sessions")) {
                return { session_id: "session-1", github_user_id: 42 };
              }
              if (sql.includes("COUNT(*) AS count")) return { count: 1 };
              if (sql.includes("COUNT(batch.batch_index) AS count")) {
                return { count: 1 };
              }
              return null;
            },
          };
          return statement;
        },
        async batch(statements: Array<{ sql: string }>) {
          batches.push(statements.map((statement) => statement.sql));
          return [];
        },
      },
    } as never;
    const response = await putActivity(
      new Request("https://api.test/v1/activity/days", {
        method: "PUT",
        headers: {
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceVersion: 1,
          timezone: "Asia/Shanghai",
          syncId: "00000000-0000-4000-8000-000000000001",
          batchIndex: 0,
          batchCount: 1,
          days: [day],
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      complete: true,
    });
    expect(batches).toHaveLength(2);
    expect(batches[0]?.join("\n")).toContain("activity_sync_days");
    expect(batches[1]?.join("\n")).toContain("DELETE FROM daily_activity");
    expect(batches[1]?.join("\n")).toContain("FROM activity_sync_days");
    expect(batches[1]?.join("\n")).toContain("activity_snapshot_states");
    expect(batches[1]?.join("\n")).toContain("DELETE FROM activity_sync_batches");
  });

  it("rejects a sync id already owned by different snapshot metadata", async () => {
    const env = {
      DB: {
        prepare(sql: string) {
          const statement = {
            sql,
            bind() {
              return statement;
            },
            async first() {
              if (sql.includes("FROM sessions")) {
                return { session_id: "session-1", github_user_id: 42 };
              }
              return null;
            },
          };
          return statement;
        },
        async batch() {
          return [];
        },
      },
    } as never;
    const response = await putActivity(
      new Request("https://api.test/v1/activity/days", {
        method: "PUT",
        headers: {
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceVersion: 1,
          timezone: "Asia/Shanghai",
          syncId: "00000000-0000-4000-8000-000000000001",
          batchIndex: 0,
          batchCount: 1,
          days: [],
        }),
      }),
      env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "activity_sync_conflict",
    });
  });
});
