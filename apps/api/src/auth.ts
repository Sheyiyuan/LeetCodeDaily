import type { Env } from "./env";
import { isAllowedChromiumAppRedirect } from "./extension-origin";
import { json } from "./http";
import { decryptSecret, encryptSecret } from "./security/encryption";
import { encryptionKeyForVersion, readEncryptionKeyRing } from "./security/key-ring";
import { authenticate, sha256Hex } from "./security/session";

interface GitHubTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

interface AuthAttempt {
  redirect_uri: string;
  code_verifier: string;
  expires_at: string;
}

interface AuthGrant {
  github_user_id: number;
  encrypted_access_token: string;
  nonce: string;
  key_version: number;
  access_token_expires_at: string;
  expires_at: string;
  used_at: string | null;
}

// Classic OAuth App tokens are commonly non-expiring. Keep one canonical
// timestamp so the extension can treat them as a durable credential while
// still using the existing short-lived browser session flow.
const NON_EXPIRING_TOKEN_EXPIRES_AT = "9999-12-31T23:59:59.999Z";

function requireConfiguration(env: Env): asserts env is Env & {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  PUBLIC_BASE_URL: string;
} {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.PUBLIC_BASE_URL) {
    throw new Error("GitHub authentication is not configured");
  }
  readEncryptionKeyRing(env);
}

function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function addSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + seconds * 1_000).toISOString();
}

function tokenExpiresAt(now: Date, expiresIn: number | undefined): string {
  return typeof expiresIn === "number" && expiresIn > 0
    ? addSeconds(now, expiresIn)
    : NON_EXPIRING_TOKEN_EXPIRES_AT;
}

export function isAllowedAuthRedirect(
  value: unknown,
  env: { ALLOWED_EXTENSION_ORIGIN: string },
): value is string {
  return isAllowedChromiumAppRedirect(value, env);
}

async function tokenRequest(fields: Record<string, string>): Promise<GitHubTokenResponse> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
  const body = (await response.json()) as GitHubTokenResponse;
  if (!response.ok || body.error) {
    throw new Error(body.error_description ?? body.error ?? "GitHub token request failed");
  }
  return body;
}

async function githubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "LeetCodeDaily",
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!response.ok) throw new Error("Unable to read GitHub account");
  return (await response.json()) as GitHubUser;
}

function callbackUrl(env: Env & { PUBLIC_BASE_URL: string }): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/v1/auth/github/callback`;
}

function redirectWith(redirectUri: string, fields: Record<string, string>): Response {
  const destination = new URL(redirectUri);
  for (const [name, value] of Object.entries(fields)) {
    destination.searchParams.set(name, value);
  }
  return Response.redirect(destination.toString(), 302);
}

export async function startGitHubAuth(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env);
  const body = (await request.json().catch(() => null)) as {
    redirectUri?: unknown;
  } | null;
  if (!isAllowedAuthRedirect(body?.redirectUri, env)) {
    return json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  const state = randomToken();
  const verifier = randomToken(48);
  const verifierDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const now = new Date();
  await env.DB.prepare(
    `INSERT INTO auth_attempts
      (state_hash, redirect_uri, code_verifier, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      await sha256Hex(state),
      body.redirectUri,
      verifier,
      addSeconds(now, 10 * 60),
      now.toISOString(),
    )
    .run();

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl(env));
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", base64Url(new Uint8Array(verifierDigest)));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return json({ authorizeUrl: authorizeUrl.toString() });
}

export async function finishGitHubAuth(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return json({ error: "missing_state" }, { status: 400 });

  const stateHash = await sha256Hex(state);
  const attempt = await env.DB.prepare(
    `SELECT redirect_uri, code_verifier, expires_at
       FROM auth_attempts
      WHERE state_hash = ?`,
  )
    .bind(stateHash)
    .first<AuthAttempt>();
  if (!attempt || attempt.expires_at <= new Date().toISOString()) {
    return json({ error: "invalid_or_expired_state" }, { status: 400 });
  }
  await env.DB.prepare("DELETE FROM auth_attempts WHERE state_hash = ?").bind(stateHash).run();

  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (oauthError || !code) {
    return redirectWith(attempt.redirect_uri, {
      error: oauthError ?? "missing_code",
    });
  }

  try {
    const token = await tokenRequest({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(env),
      code_verifier: attempt.code_verifier,
    });
    if (!token.access_token) throw new Error("GitHub OAuth App did not return an access token");
    const hasExpiryFields =
      token.expires_in !== undefined ||
      token.refresh_token !== undefined ||
      token.refresh_token_expires_in !== undefined;
    if (
      hasExpiryFields &&
      (!token.refresh_token || !token.expires_in || !token.refresh_token_expires_in)
    ) {
      throw new Error("GitHub OAuth App returned an incomplete expiring token");
    }

    const user = await githubUser(token.access_token);
    const now = new Date();
    const keyRing = readEncryptionKeyRing(env);
    const activeKey = encryptionKeyForVersion(keyRing, keyRing.activeVersion);
    const access = await encryptSecret(token.access_token, activeKey);
    const credential = await encryptSecret(token.refresh_token ?? token.access_token, activeKey);
    const existing = await env.DB.prepare(
      "SELECT current_login FROM github_accounts WHERE github_user_id = ?",
    )
      .bind(user.id)
      .first<{ current_login: string }>();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO github_accounts
          (github_user_id, current_login, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(github_user_id) DO UPDATE SET
           current_login = excluded.current_login,
           updated_at = excluded.updated_at`,
      ).bind(user.id, user.login, now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT OR IGNORE INTO github_login_aliases
          (normalized_login, github_user_id, created_at)
         VALUES (?, ?, ?)`,
      ).bind(user.login.toLowerCase(), user.id, now.toISOString()),
      env.DB.prepare(
        `INSERT INTO github_credentials
          (github_user_id, encrypted_refresh_token, nonce, key_version,
           token_expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(github_user_id) DO UPDATE SET
           encrypted_refresh_token = excluded.encrypted_refresh_token,
           nonce = excluded.nonce,
           key_version = excluded.key_version,
           token_expires_at = excluded.token_expires_at,
           updated_at = excluded.updated_at`,
      ).bind(
        user.id,
        credential.ciphertext,
        credential.nonce,
        keyRing.activeVersion,
        token.refresh_token_expires_in ? addSeconds(now, token.refresh_token_expires_in) : null,
        now.toISOString(),
      ),
    ]);
    if (
      existing?.current_login &&
      existing.current_login.toLowerCase() !== user.login.toLowerCase()
    ) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO github_login_aliases
          (normalized_login, github_user_id, created_at)
         VALUES (?, ?, ?)`,
      )
        .bind(existing.current_login.toLowerCase(), user.id, now.toISOString())
        .run();
    }

    const grant = randomToken();
    await env.DB.prepare(
      `INSERT INTO auth_grants
        (grant_hash, github_user_id, encrypted_access_token, nonce, key_version,
         access_token_expires_at, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        await sha256Hex(grant),
        user.id,
        access.ciphertext,
        access.nonce,
        keyRing.activeVersion,
        tokenExpiresAt(now, token.expires_in),
        addSeconds(now, 5 * 60),
        now.toISOString(),
      )
      .run();

    return redirectWith(attempt.redirect_uri, { grant });
  } catch {
    return redirectWith(attempt.redirect_uri, { error: "github_auth_failed" });
  }
}

export async function exchangeAuthGrant(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env);
  const body = (await request.json().catch(() => null)) as {
    grant?: unknown;
  } | null;
  if (typeof body?.grant !== "string" || !body.grant) {
    return json({ error: "invalid_grant" }, { status: 400 });
  }

  const grantHash = await sha256Hex(body.grant);
  const grant = await env.DB.prepare(
    `SELECT github_user_id, encrypted_access_token, nonce, key_version,
            access_token_expires_at, expires_at, used_at
       FROM auth_grants
      WHERE grant_hash = ?`,
  )
    .bind(grantHash)
    .first<AuthGrant>();
  const now = new Date();
  if (grant?.used_at || !grant || grant.expires_at <= now.toISOString()) {
    return json({ error: "invalid_or_expired_grant" }, { status: 401 });
  }
  const consumed = await env.DB.prepare(
    `UPDATE auth_grants SET used_at = ?
      WHERE grant_hash = ? AND used_at IS NULL`,
  )
    .bind(now.toISOString(), grantHash)
    .run();
  if ((consumed.meta.changes ?? 0) !== 1) {
    return json({ error: "invalid_or_expired_grant" }, { status: 401 });
  }

  const accessToken = await decryptSecret(
    grant.encrypted_access_token,
    grant.nonce,
    encryptionKeyForVersion(readEncryptionKeyRing(env), grant.key_version),
  );
  const sessionToken = randomToken();
  const sessionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sessions
      (session_id, github_user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      grant.github_user_id,
      await sha256Hex(sessionToken),
      addSeconds(now, 30 * 24 * 60 * 60),
      now.toISOString(),
    )
    .run();
  const account = await env.DB.prepare(
    "SELECT current_login FROM github_accounts WHERE github_user_id = ?",
  )
    .bind(grant.github_user_id)
    .first<{ current_login: string }>();

  return json({
    sessionToken,
    sessionExpiresAt: addSeconds(now, 30 * 24 * 60 * 60),
    accessToken,
    accessTokenExpiresAt: grant.access_token_expires_at,
    github: {
      id: grant.github_user_id,
      login: account?.current_login ?? "",
    },
  });
}

export async function refreshGitHubAccess(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env);
  const session = await authenticate(request, env);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });

  const credential = await env.DB.prepare(
    `SELECT encrypted_refresh_token, nonce, key_version, token_expires_at
       FROM github_credentials
      WHERE github_user_id = ?`,
  )
    .bind(session.githubUserId)
    .first<{
      encrypted_refresh_token: string;
      nonce: string;
      key_version: number;
      token_expires_at: string | null;
    }>();
  if (
    !credential ||
    (credential.token_expires_at && credential.token_expires_at <= new Date().toISOString())
  ) {
    return json({ error: "reauthorization_required" }, { status: 401 });
  }

  const keyRing = readEncryptionKeyRing(env);
  if (!credential.token_expires_at) {
    const accessToken = await decryptSecret(
      credential.encrypted_refresh_token,
      credential.nonce,
      encryptionKeyForVersion(keyRing, credential.key_version),
    );
    return json({
      accessToken,
      accessTokenExpiresAt: NON_EXPIRING_TOKEN_EXPIRES_AT,
    });
  }

  try {
    const oldRefresh = await decryptSecret(
      credential.encrypted_refresh_token,
      credential.nonce,
      encryptionKeyForVersion(keyRing, credential.key_version),
    );
    const token = await tokenRequest({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: oldRefresh,
    });
    if (
      !token.access_token ||
      !token.refresh_token ||
      !token.expires_in ||
      !token.refresh_token_expires_in
    ) {
      throw new Error("Invalid refresh response");
    }
    const now = new Date();
    const refresh = await encryptSecret(
      token.refresh_token,
      encryptionKeyForVersion(keyRing, keyRing.activeVersion),
    );
    await env.DB.prepare(
      `UPDATE github_credentials
          SET encrypted_refresh_token = ?, nonce = ?, key_version = ?,
              token_expires_at = ?, updated_at = ?
        WHERE github_user_id = ?`,
    )
      .bind(
        refresh.ciphertext,
        refresh.nonce,
        keyRing.activeVersion,
        addSeconds(now, token.refresh_token_expires_in),
        now.toISOString(),
        session.githubUserId,
      )
      .run();
    return json({
      accessToken: token.access_token,
      accessTokenExpiresAt: tokenExpiresAt(now, token.expires_in),
    });
  } catch {
    return json({ error: "reauthorization_required" }, { status: 401 });
  }
}

export async function revokeSession(request: Request, env: Env): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE session_id = ?")
    .bind(new Date().toISOString(), session.sessionId)
    .run();
  return new Response(null, { status: 204 });
}
