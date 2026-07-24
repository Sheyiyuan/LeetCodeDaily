import type { Env } from "./env";

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
  ]);
}
