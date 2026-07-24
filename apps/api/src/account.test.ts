import { describe, expect, it } from "vitest";

import { deleteAccount } from "./account";

function testEnv(statements: string[]) {
  return {
    DB: {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind(..._values: unknown[]) {
            return {
              first: async () =>
                sql.includes("FROM sessions")
                  ? { session_id: "session-1", github_user_id: 42 }
                  : null,
              run: async () => ({ meta: { changes: 1 } }),
            };
          },
        };
      },
    },
  } as never;
}

describe("account deletion", () => {
  it("rejects requests without a session", async () => {
    const statements: string[] = [];
    const response = await deleteAccount(
      new Request("https://api.test/v1/account", { method: "DELETE" }),
      testEnv(statements),
    );

    expect(response.status).toBe(401);
    expect(statements).toHaveLength(0);
  });

  it("deletes the authenticated account", async () => {
    const statements: string[] = [];
    const response = await deleteAccount(
      new Request("https://api.test/v1/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer session-token" },
      }),
      testEnv(statements),
    );

    expect(response.status).toBe(204);
    expect(statements[0]).toContain("FROM sessions");
    expect(statements[1]).toContain("DELETE FROM github_accounts");
  });
});
