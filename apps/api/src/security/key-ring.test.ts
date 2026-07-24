import { describe, expect, it } from "vitest";

import {
  encryptionKeyForVersion,
  readEncryptionKeyRing,
} from "./key-ring";

function encodedKey(fill: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));
}

describe("encryption key ring", () => {
  it("treats the existing secret as version one", () => {
    const key = encodedKey(1);
    const ring = readEncryptionKeyRing({ TOKEN_ENCRYPTION_KEY: key });

    expect(ring.activeVersion).toBe(1);
    expect(encryptionKeyForVersion(ring, 1)).toBe(key);
  });

  it("selects an active key while retaining old decrypt-only versions", () => {
    const oldKey = encodedKey(1);
    const activeKey = encodedKey(2);
    const ring = readEncryptionKeyRing({
      TOKEN_ENCRYPTION_KEY_RING: JSON.stringify({
        activeVersion: 2,
        keys: { 1: oldKey, 2: activeKey },
      }),
    });

    expect(ring.activeVersion).toBe(2);
    expect(encryptionKeyForVersion(ring, 1)).toBe(oldKey);
    expect(encryptionKeyForVersion(ring, 2)).toBe(activeKey);
  });

  it("rejects malformed rings and missing active keys", () => {
    expect(() =>
      readEncryptionKeyRing({ TOKEN_ENCRYPTION_KEY_RING: "not-json" }),
    ).toThrow("valid JSON");
    expect(() =>
      readEncryptionKeyRing({
        TOKEN_ENCRYPTION_KEY_RING: JSON.stringify({
          activeVersion: 2,
          keys: { 1: encodedKey(1) },
        }),
      }),
    ).toThrow("missing its active key");
  });
});
