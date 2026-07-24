import type { Env } from "./env";
import { decryptSecret, encryptSecret } from "./security/encryption";
import {
  encryptionKeyForVersion,
  readEncryptionKeyRing,
} from "./security/key-ring";

interface CredentialForRotation {
  github_user_id: number;
  encrypted_refresh_token: string;
  nonce: string;
  key_version: number;
}

export interface KeyRotationResult {
  rotated: number;
  failed: number;
}

export async function cleanupExpiredRecords(
  env: Env,
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  const revokedBefore = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_attempts WHERE expires_at <= ?").bind(
      timestamp,
    ),
    env.DB.prepare("DELETE FROM auth_grants WHERE expires_at <= ?").bind(
      timestamp,
    ),
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)`,
    ).bind(timestamp, revokedBefore),
    env.DB.prepare("DELETE FROM api_rate_limits WHERE expires_at <= ?").bind(
      timestamp,
    ),
    env.DB.prepare(
      `DELETE FROM activity_sync_batches
        WHERE sync_id IN (
          SELECT sync_id FROM activity_syncs WHERE expires_at <= ?
        )`,
    ).bind(timestamp),
    env.DB.prepare(
      `DELETE FROM activity_sync_days
        WHERE sync_id IN (
          SELECT sync_id FROM activity_syncs WHERE expires_at <= ?
        )`,
    ).bind(timestamp),
    env.DB.prepare("DELETE FROM activity_syncs WHERE expires_at <= ?").bind(
      timestamp,
    ),
  ]);
}

export async function rotateCredentialEncryptionKeys(
  env: Env,
  limit = 100,
): Promise<KeyRotationResult> {
  const ring = readEncryptionKeyRing(env);
  const activeKey = encryptionKeyForVersion(ring, ring.activeVersion);
  const result = await env.DB.prepare(
    `SELECT github_user_id, encrypted_refresh_token, nonce, key_version
       FROM github_credentials
      WHERE key_version <> ?
      ORDER BY updated_at
      LIMIT ?`,
  )
    .bind(ring.activeVersion, limit)
    .all<CredentialForRotation>();

  let rotated = 0;
  let failed = 0;
  for (const credential of result.results ?? []) {
    try {
      const plaintext = await decryptSecret(
        credential.encrypted_refresh_token,
        credential.nonce,
        encryptionKeyForVersion(ring, credential.key_version),
      );
      const encrypted = await encryptSecret(plaintext, activeKey);
      const update = await env.DB.prepare(
        `UPDATE github_credentials
            SET encrypted_refresh_token = ?, nonce = ?, key_version = ?,
                updated_at = ?
          WHERE github_user_id = ? AND key_version = ?`,
      )
        .bind(
          encrypted.ciphertext,
          encrypted.nonce,
          ring.activeVersion,
          new Date().toISOString(),
          credential.github_user_id,
          credential.key_version,
        )
        .run();
      rotated += update.meta.changes ?? 0;
    } catch {
      failed += 1;
    }
  }
  return { rotated, failed };
}

export async function runScheduledMaintenance(env: Env): Promise<void> {
  await cleanupExpiredRecords(env);
  const rotation = await rotateCredentialEncryptionKeys(env);
  console.log(
    JSON.stringify({
      event: "credential_key_rotation",
      rotated: rotation.rotated,
      failed: rotation.failed,
    }),
  );
}
