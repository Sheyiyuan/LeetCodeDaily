import { putActivity, putHeatmapSettings } from "./activity";
import {
  exchangeAuthGrant,
  finishGitHubAuth,
  refreshGitHubAccess,
  revokeSession,
  startGitHubAuth,
} from "./auth";
import type { Env } from "./env";
import { renderHeatmap } from "./heatmap";
import { corsHeaders, json, withCors } from "./http";

function validYear(value: string | null): number {
  const current = new Date().getUTCFullYear();
  if (!value) return current;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= current + 1
    ? parsed
    : current;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "leetcode-daily-api" });
  }

  const heatmapMatch = url.pathname.match(
    /^\/heatmap\/github\/([a-zA-Z0-9-]{1,39})\.svg$/,
  );
  if (request.method === "GET" && heatmapMatch?.[1]) {
    return renderHeatmap(
      heatmapMatch[1],
      validYear(url.searchParams.get("year")),
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

  return json({ error: "not_found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch {
      return json({ error: "internal_error" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
