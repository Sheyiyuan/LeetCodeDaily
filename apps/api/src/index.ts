import { putActivity, putHeatmapSettings } from "./activity";
import { deleteAccount } from "./account";
import {
  exchangeAuthGrant,
  finishGitHubAuth,
  refreshGitHubAccess,
  revokeSession,
  startGitHubAuth,
} from "./auth";
import type { Env } from "./env";
import {
  renderHeatmap,
  renderHeatmapError,
  type HeatmapTheme,
} from "./heatmap";
import { corsHeaders, json, withCors } from "./http";
import { runScheduledMaintenance } from "./maintenance";
import { enforceRateLimit, type RateLimitPolicy } from "./rate-limit";

function validYear(value: string | null): number {
  const current = new Date().getUTCFullYear();
  if (!value) return current;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= current + 1
    ? parsed
    : current;
}

function validTheme(value: string | null): HeatmapTheme {
  return value === "light" || value === "dark" ? value : "auto";
}

function rateLimitPolicy(method: string, pathname: string): RateLimitPolicy | null {
  const key = `${method} ${pathname}`;
  const policies: Record<string, RateLimitPolicy> = {
    "POST /v1/auth/github/start": {
      scope: "auth-start",
      limit: 10,
      windowSeconds: 10 * 60,
    },
    "POST /v1/auth/exchange": {
      scope: "auth-exchange",
      limit: 20,
      windowSeconds: 60,
    },
    "POST /v1/auth/github/refresh": {
      scope: "auth-refresh",
      limit: 30,
      windowSeconds: 60,
    },
    "PUT /v1/activity/days": {
      scope: "activity-write",
      limit: 30,
      windowSeconds: 60,
    },
    "PUT /v1/heatmap/settings": {
      scope: "heatmap-settings",
      limit: 30,
      windowSeconds: 60,
    },
    "DELETE /v1/auth/session": {
      scope: "session-delete",
      limit: 10,
      windowSeconds: 60,
    },
    "DELETE /v1/account": {
      scope: "account-delete",
      limit: 10,
      windowSeconds: 60,
    },
  };
  return policies[key] ?? null;
}

function routeLabel(pathname: string): string {
  if (/^\/heatmap\/github\/[a-zA-Z0-9-]{1,39}\.svg$/.test(pathname)) {
    return "/heatmap/github/:login.svg";
  }
  const known = new Set([
    "/health",
    "/v1/activity/days",
    "/v1/heatmap/settings",
    "/v1/auth/github/start",
    "/v1/auth/github/callback",
    "/v1/auth/exchange",
    "/v1/auth/github/refresh",
    "/v1/auth/session",
    "/v1/account",
  ]);
  return known.has(pathname) ? pathname : "unmatched";
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "leetcode-daily-api" });
  }

  const policy = rateLimitPolicy(request.method, url.pathname);
  if (policy) {
    const limited = await enforceRateLimit(request, env, policy);
    if (limited) return withCors(limited, request, env);
  }

  const heatmapMatch = url.pathname.match(
    /^\/heatmap\/github\/([a-zA-Z0-9-]{1,39})\.svg$/,
  );
  if (request.method === "GET" && heatmapMatch?.[1]) {
    return renderHeatmap(
      heatmapMatch[1],
      validYear(url.searchParams.get("year")),
      validTheme(url.searchParams.get("theme")),
      env,
    );
  }

  if (request.method === "PUT" && url.pathname === "/v1/activity/days") {
    return withCors(await putActivity(request, env), request, env);
  }
  if (request.method === "PUT" && url.pathname === "/v1/heatmap/settings") {
    return withCors(await putHeatmapSettings(request, env), request, env);
  }
  if (request.method === "POST" && url.pathname === "/v1/auth/github/start") {
    return withCors(await startGitHubAuth(request, env), request, env);
  }
  if (request.method === "GET" && url.pathname === "/v1/auth/github/callback") {
    return finishGitHubAuth(request, env);
  }
  if (request.method === "POST" && url.pathname === "/v1/auth/exchange") {
    return withCors(await exchangeAuthGrant(request, env), request, env);
  }
  if (request.method === "POST" && url.pathname === "/v1/auth/github/refresh") {
    return withCors(await refreshGitHubAccess(request, env), request, env);
  }
  if (request.method === "DELETE" && url.pathname === "/v1/auth/session") {
    return withCors(await revokeSession(request, env), request, env);
  }
  if (request.method === "DELETE" && url.pathname === "/v1/account") {
    return withCors(await deleteAccount(request, env), request, env);
  }

  return json({ error: "not_found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await route(request, env);
    } catch {
      const url = new URL(request.url);
      if (
        request.method === "GET" &&
        /^\/heatmap\/github\/[a-zA-Z0-9-]{1,39}\.svg$/.test(url.pathname)
      ) {
        response = renderHeatmapError(validTheme(url.searchParams.get("theme")));
      } else {
        response = json({ error: "internal_error" }, { status: 500 });
      }
    }
    const url = new URL(request.url);
    console.log(
      JSON.stringify({
        event: "request_completed",
        method: request.method,
        route: routeLabel(url.pathname),
        status: response.status,
        durationMs: Date.now() - startedAt,
        ray: request.headers.get("CF-Ray"),
      }),
    );
    return response;
  },
  scheduled(_controller, env, context) {
    context.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
