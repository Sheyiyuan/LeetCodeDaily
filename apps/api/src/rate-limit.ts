import type { Env } from "./env";
import { json } from "./http";
import { sha256Hex } from "./security/session";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export async function enforceRateLimit(
  request: Request,
  env: Env,
  policy: RateLimitPolicy,
): Promise<Response | null> {
  const clientAddress = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  const window = Math.floor(now / (policy.windowSeconds * 1_000));
  const clientHash = await sha256Hex(clientAddress);
  const bucketKey = `${policy.scope}:${window}:${clientHash}`;
  const expiresAt = new Date(
    (window + 2) * policy.windowSeconds * 1_000,
  ).toISOString();

  try {
    const result = await env.DB.prepare(
      `INSERT INTO api_rate_limits (bucket_key, request_count, expires_at)
       VALUES (?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         request_count = request_count + 1,
         expires_at = excluded.expires_at
       RETURNING request_count`,
    )
      .bind(bucketKey, expiresAt)
      .first<{ request_count: number }>();
    if ((result?.request_count ?? 1) <= policy.limit) return null;
  } catch {
    // Authentication and validation still protect writes if the limiter is unavailable.
    return null;
  }

  const retryAfter = Math.max(
    1,
    Math.ceil(((window + 1) * policy.windowSeconds * 1_000 - now) / 1_000),
  );
  return json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
