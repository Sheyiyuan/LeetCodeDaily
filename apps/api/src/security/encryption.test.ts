import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./encryption";

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("token encryption", () => {
  it("round-trips with AES-GCM", async () => {
    const key = base64(new Uint8Array(32).fill(7));
    const encrypted = await encryptSecret("refresh-token", key);
    expect(encrypted.ciphertext).not.toContain("refresh-token");
    await expect(
      decryptSecret(encrypted.ciphertext, encrypted.nonce, key),
    ).resolves.toBe("refresh-token");
  });
});
