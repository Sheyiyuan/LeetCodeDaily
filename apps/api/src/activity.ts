import type { Env } from "./env";
import { json } from "./http";
import { authenticate } from "./security/session";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ActivityDayInput {
  localDate: string;
  acceptedSubmissionCount: number;
  distinctProblemCount: number;
}

function isActivityDay(value: unknown): value is ActivityDayInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.localDate === "string" &&
    DATE_PATTERN.test(item.localDate) &&
    Number.isInteger(item.acceptedSubmissionCount) &&
    Number(item.acceptedSubmissionCount) >= 0 &&
    Number.isInteger(item.distinctProblemCount) &&
    Number(item.distinctProblemCount) >= 0 &&
    Number(item.distinctProblemCount) <= Number(item.acceptedSubmissionCount)
  );
}

export async function putActivity(
  request: Request,
  env: Env,
): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const body = input as {
    sourceVersion?: unknown;
    timezone?: unknown;
    days?: unknown;
  };
  if (
    body.sourceVersion !== 1 ||
    typeof body.timezone !== "string" ||
    body.timezone.length > 64 ||
    !Array.isArray(body.days) ||
    body.days.length > 400 ||
    !body.days.every(isActivityDay)
  ) {
    return json({ error: "invalid_activity_payload" }, { status: 400 });
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }).format();
  } catch {
    return json({ error: "invalid_timezone" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const statements = body.days.map((day) =>
    env.DB.prepare(
      `INSERT INTO daily_activity (
         github_user_id,
         local_date,
         accepted_submission_count,
         distinct_problem_count,
         source_version,
         updated_at
       ) VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT (github_user_id, local_date) DO UPDATE SET
         accepted_submission_count = excluded.accepted_submission_count,
         distinct_problem_count = excluded.distinct_problem_count,
         source_version = excluded.source_version,
         updated_at = excluded.updated_at`,
    ).bind(
      session.githubUserId,
      day.localDate,
      day.acceptedSubmissionCount,
      day.distinctProblemCount,
      updatedAt,
    ),
  );

  statements.push(
    env.DB.prepare(
      `INSERT INTO heatmap_settings (
         github_user_id, timezone, public_enabled, updated_at
       ) VALUES (?, ?, 0, ?)
       ON CONFLICT (github_user_id) DO UPDATE SET
         timezone = excluded.timezone,
         updated_at = excluded.updated_at`,
    ).bind(session.githubUserId, body.timezone, updatedAt),
  );

  await env.DB.batch(statements);
  return json({ ok: true, updatedAt });
}

export async function putHeatmapSettings(
  request: Request,
  env: Env,
): Promise<Response> {
  const session = await authenticate(request, env);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    publicEnabled?: unknown;
  } | null;
  if (!body || typeof body.publicEnabled !== "boolean") {
    return json({ error: "invalid_settings_payload" }, { status: 400 });
  }

  const result = await env.DB.prepare(
    `UPDATE heatmap_settings
        SET public_enabled = ?, updated_at = ?
      WHERE github_user_id = ?`,
  )
    .bind(
      body.publicEnabled ? 1 : 0,
      new Date().toISOString(),
      session.githubUserId,
    )
    .run();

  if (!result.meta.changes) {
    return json({ error: "heatmap_not_initialized" }, { status: 409 });
  }
  return json({ ok: true });
}
