import type { Env } from "./env";
import { json } from "./http";
import { authenticate } from "./security/session";

/** Delete all server-side data owned by the authenticated GitHub account. */
export async function deleteAccount(
  request: Request,
  env: Env,
): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });

  await env.DB.prepare(
    "DELETE FROM github_accounts WHERE github_user_id = ?",
  )
    .bind(session.githubUserId)
    .run();

  return new Response(null, { status: 204 });
}
