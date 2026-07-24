import type { Env } from "../env";

export interface AuthenticatedSession {
  githubUserId: number;
  sessionId: string;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticate(
  request: Request,
  env: Env,
): Promise<AuthenticatedSession | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const session = await env.DB.prepare(
    `SELECT session_id, github_user_id
       FROM sessions
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<{ session_id: string; github_user_id: number }>();

  return session
    ? {
        githubUserId: session.github_user_id,
        sessionId: session.session_id,
      }
    : null;
}
