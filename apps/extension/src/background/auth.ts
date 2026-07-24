import { API_BASE_URL } from "../shared/config";
import type { GitHubAuthState } from "../shared/messages";

const LOCAL_KEYS = {
  sessionToken: "githubSessionToken",
  sessionExpiresAt: "githubSessionExpiresAt",
  userId: "githubUserId",
  login: "githubLogin",
} as const;

const SESSION_KEYS = {
  accessToken: "githubAccessToken",
  accessTokenExpiresAt: "githubAccessTokenExpiresAt",
} as const;

interface AuthExchangeResponse {
  sessionToken: string;
  sessionExpiresAt: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  github: { id: number; login: string };
}

let accessTokenRefresh: Promise<string | null> | null = null;

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? `请求失败（${response.status}）`);
  }
  return body;
}

async function persistAuth(auth: AuthExchangeResponse): Promise<void> {
  await Promise.all([
    chrome.storage.local.set({
      [LOCAL_KEYS.sessionToken]: auth.sessionToken,
      [LOCAL_KEYS.sessionExpiresAt]: auth.sessionExpiresAt,
      [LOCAL_KEYS.userId]: auth.github.id,
      [LOCAL_KEYS.login]: auth.github.login,
    }),
    chrome.storage.session.set({
      [SESSION_KEYS.accessToken]: auth.accessToken,
      [SESSION_KEYS.accessTokenExpiresAt]: auth.accessTokenExpiresAt,
    }),
  ]);
}

export async function readGitHubAuth(): Promise<GitHubAuthState> {
  const stored = await chrome.storage.local.get(Object.values(LOCAL_KEYS));
  const expiresAt =
    typeof stored.githubSessionExpiresAt === "string"
      ? stored.githubSessionExpiresAt
      : null;
  const connected =
    typeof stored.githubSessionToken === "string" &&
    typeof stored.githubLogin === "string" &&
    expiresAt !== null &&
    expiresAt > new Date().toISOString();
  return {
    connected,
    login:
      connected && typeof stored.githubLogin === "string"
        ? stored.githubLogin
        : null,
    sessionExpiresAt: connected ? expiresAt : null,
    heatmapUrl:
      connected && typeof stored.githubLogin === "string"
        ? `${API_BASE_URL}/heatmap/github/${encodeURIComponent(stored.githubLogin)}.svg`
        : null,
  };
}

export async function sessionToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(LOCAL_KEYS.sessionToken);
  return typeof stored.githubSessionToken === "string"
    ? stored.githubSessionToken
    : null;
}

export async function connectGitHub(): Promise<GitHubAuthState> {
  const redirectUri = chrome.identity.getRedirectURL("github");
  const start = await responseJson<{ authorizeUrl: string }>(
    await fetch(`${API_BASE_URL}/v1/auth/github/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirectUri }),
    }),
  );
  const callback = await chrome.identity.launchWebAuthFlow({
    url: start.authorizeUrl,
    interactive: true,
  });
  if (!callback) throw new Error("GitHub 授权未完成");
  const callbackUrl = new URL(callback);
  const oauthError = callbackUrl.searchParams.get("error");
  const grant = callbackUrl.searchParams.get("grant");
  if (oauthError || !grant) {
    throw new Error(
      oauthError === "access_denied"
        ? "你取消了 GitHub 授权"
        : "GitHub 授权失败",
    );
  }

  const auth = await responseJson<AuthExchangeResponse>(
    await fetch(`${API_BASE_URL}/v1/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant }),
    }),
  );
  await persistAuth(auth);
  return readGitHubAuth();
}

export async function githubAccessToken(): Promise<string | null> {
  const session = await chrome.storage.session.get(Object.values(SESSION_KEYS));
  if (
    typeof session.githubAccessToken === "string" &&
    typeof session.githubAccessTokenExpiresAt === "string" &&
    Date.parse(session.githubAccessTokenExpiresAt) > Date.now() + 60_000
  ) {
    return session.githubAccessToken;
  }

  accessTokenRefresh ??= refreshAccessToken().finally(() => {
    accessTokenRefresh = null;
  });
  return accessTokenRefresh;
}

async function refreshAccessToken(): Promise<string | null> {
  const localToken = await sessionToken();
  if (!localToken) return null;
  const refreshed = await responseJson<{
    accessToken: string;
    accessTokenExpiresAt: string;
  }>(
    await fetch(`${API_BASE_URL}/v1/auth/github/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localToken}`,
      },
    }),
  );
  await chrome.storage.session.set({
    [SESSION_KEYS.accessToken]: refreshed.accessToken,
    [SESSION_KEYS.accessTokenExpiresAt]: refreshed.accessTokenExpiresAt,
  });
  return refreshed.accessToken;
}

export async function disconnectGitHub(): Promise<void> {
  const stored = await chrome.storage.local.get(LOCAL_KEYS.sessionToken);
  if (typeof stored.githubSessionToken === "string") {
    await fetch(`${API_BASE_URL}/v1/auth/session`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${stored.githubSessionToken}` },
    }).catch(() => undefined);
  }
  await Promise.all([
    chrome.storage.local.remove(Object.values(LOCAL_KEYS)),
    chrome.storage.session.remove(Object.values(SESSION_KEYS)),
  ]);
}

export async function deleteGitHubAccount(): Promise<void> {
  const token = await sessionToken();
  if (!token) throw new Error("尚未连接 GitHub");
  const response = await fetch(`${API_BASE_URL}/v1/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `删除账户失败（${response.status}）`);
  }
  await Promise.all([
    chrome.storage.local.remove(Object.values(LOCAL_KEYS)),
    chrome.storage.session.remove(Object.values(SESSION_KEYS)),
  ]);
}
