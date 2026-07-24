import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./security/encryption";
import {
  cleanupExpiredRecords,
  rotateCredentialEncryptionKeys,
} from "./maintenance";

function encodedKey(fill: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));
}

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

  it("re-encrypts old credentials with the active key version", async () => {
    const oldKey = encodedKey(1);
    const activeKey = encodedKey(2);
    const oldEncrypted = await encryptSecret("refresh-token", oldKey);
    let updateBindings: unknown[] = [];
    const env = {
      TOKEN_ENCRYPTION_KEY_RING: JSON.stringify({
        activeVersion: 2,
        keys: { 1: oldKey, 2: activeKey },
      }),
      DB: {
        prepare(sql: string) {
          return {
            bind(...bindings: unknown[]) {
              if (sql.includes("SELECT github_user_id")) {
                return {
                  async all() {
                    return {
                      results: [
                        {
                          github_user_id: 42,
                          encrypted_refresh_token: oldEncrypted.ciphertext,
                          nonce: oldEncrypted.nonce,
                          key_version: 1,
                        },
                      ],
                    };
                  },
                };
              }
              updateBindings = bindings;
              return {
                async run() {
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    } as never;

    await expect(rotateCredentialEncryptionKeys(env)).resolves.toEqual({
      rotated: 1,
      failed: 0,
    });
    expect(updateBindings[2]).toBe(2);
    await expect(
      decryptSecret(
        String(updateBindings[0]),
        String(updateBindings[1]),
        activeKey,
      ),
    ).resolves.toBe("refresh-token");
  });
});
