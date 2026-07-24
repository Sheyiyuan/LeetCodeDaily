import type { Env } from "./env";
import { json } from "./http";
import { authenticate } from "./security/session";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ActivityDayInput {
  localDate: string;
  acceptedSubmissionCount: number;
  distinctProblemCount: number;
}

interface ActivityPayloadBase {
  sourceVersion: 1;
  timezone: string;
  days: ActivityDayInput[];
}

type ActivitySnapshotPayload = ActivityPayloadBase & {
  syncId: string;
  batchIndex: number;
  batchCount: number;
};

type ActivityPayload = ActivityPayloadBase | ActivitySnapshotPayload;

const SYNC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function parseActivityPayload(input: unknown): ActivityPayload | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  if (
    body.sourceVersion !== 1 ||
    typeof body.timezone !== "string" ||
    body.timezone.length > 64 ||
    !Array.isArray(body.days) ||
    body.days.length > 400 ||
    !body.days.every(isActivityDay)
  ) {
    return null;
  }

  const snapshotFields = [body.syncId, body.batchIndex, body.batchCount];
  const hasSnapshot = snapshotFields.some((value) => value !== undefined);
  if (
    hasSnapshot &&
    (!snapshotFields.every((value) => value !== undefined) ||
      typeof body.syncId !== "string" ||
      !SYNC_ID_PATTERN.test(body.syncId) ||
      !Number.isInteger(body.batchIndex) ||
      Number(body.batchIndex) < 0 ||
      !Number.isInteger(body.batchCount) ||
      Number(body.batchCount) < 1 ||
      Number(body.batchCount) > 1_000 ||
      Number(body.batchIndex) >= Number(body.batchCount))
  ) {
    return null;
  }

  return body as unknown as ActivityPayload;
}

function isActivitySnapshotPayload(
  body: ActivityPayload,
): body is ActivitySnapshotPayload {
  return "syncId" in body;
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

  const body = parseActivityPayload(input);
  if (!body) {
    return json({ error: "invalid_activity_payload" }, { status: 400 });
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }).format();
  } catch {
    return json({ error: "invalid_timezone" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  if (isActivitySnapshotPayload(body)) {
    return putActivitySnapshotBatch(
      env,
      session.githubUserId,
      body,
      updatedAt,
    );
  }

  await putLegacyActivity(env, session.githubUserId, body, updatedAt);
  return json({ ok: true, updatedAt });
}

async function putLegacyActivity(
  env: Env,
  githubUserId: number,
  body: ActivityPayload,
  updatedAt: string,
): Promise<void> {
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
      githubUserId,
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
    ).bind(githubUserId, body.timezone, updatedAt),
  );

  await env.DB.batch(statements);
}

async function putActivitySnapshotBatch(
  env: Env,
  githubUserId: number,
  body: ActivitySnapshotPayload,
  updatedAt: string,
): Promise<Response> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO activity_syncs
        (sync_id, github_user_id, timezone, batch_count, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sync_id) DO UPDATE SET
         expires_at = excluded.expires_at
       WHERE activity_syncs.github_user_id = excluded.github_user_id
         AND activity_syncs.timezone = excluded.timezone
         AND activity_syncs.batch_count = excluded.batch_count`,
    ).bind(
      body.syncId,
      githubUserId,
      body.timezone,
      body.batchCount,
      expiresAt,
      updatedAt,
    ),
    ...body.days.map((day) =>
      env.DB.prepare(
        `INSERT INTO activity_sync_days
          (sync_id, local_date, accepted_submission_count,
           distinct_problem_count, source_version)
         SELECT ?, ?, ?, ?, 1
          WHERE EXISTS (
            SELECT 1
              FROM activity_syncs
             WHERE sync_id = ?
               AND github_user_id = ?
               AND timezone = ?
               AND batch_count = ?
          )
         ON CONFLICT(sync_id, local_date) DO UPDATE SET
           accepted_submission_count = excluded.accepted_submission_count,
           distinct_problem_count = excluded.distinct_problem_count,
           source_version = excluded.source_version`,
      ).bind(
        body.syncId,
        day.localDate,
        day.acceptedSubmissionCount,
        day.distinctProblemCount,
        body.syncId,
        githubUserId,
        body.timezone,
        body.batchCount,
      ),
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO activity_sync_batches (sync_id, batch_index)
       SELECT ?, ?
        WHERE EXISTS (
          SELECT 1
            FROM activity_syncs
           WHERE sync_id = ?
             AND github_user_id = ?
             AND timezone = ?
             AND batch_count = ?
        )`,
    ).bind(
      body.syncId,
      body.batchIndex,
      body.syncId,
      githubUserId,
      body.timezone,
      body.batchCount,
    ),
  ];
  await env.DB.batch(statements);

  const received = await env.DB.prepare(
    `SELECT COUNT(batch.batch_index) AS count
       FROM activity_syncs AS sync
       LEFT JOIN activity_sync_batches AS batch
         ON batch.sync_id = sync.sync_id
      WHERE sync.sync_id = ?
        AND sync.github_user_id = ?
        AND sync.timezone = ?
        AND sync.batch_count = ?
      GROUP BY sync.sync_id`,
  )
    .bind(body.syncId, githubUserId, body.timezone, body.batchCount)
    .first<{ count: number }>();
  if (!received) {
    return json({ error: "activity_sync_conflict" }, { status: 409 });
  }
  if ((received?.count ?? 0) < body.batchCount) {
    return json({ ok: true, complete: false, updatedAt });
  }

  // D1 batches are transactional. Repeating the version guard makes stale or
  // concurrently retried final batches no-ops before their staging cleanup.
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM daily_activity
        WHERE github_user_id = ?
          AND EXISTS (
            SELECT 1
              FROM activity_syncs AS incoming
              LEFT JOIN activity_snapshot_states AS applied
                ON applied.github_user_id = incoming.github_user_id
             WHERE incoming.sync_id = ?
               AND incoming.github_user_id = ?
               AND (
                 applied.github_user_id IS NULL
                 OR incoming.created_at > applied.applied_sync_created_at
                 OR (
                   incoming.created_at = applied.applied_sync_created_at
                   AND incoming.sync_id > applied.applied_sync_id
                 )
               )
          )`,
    ).bind(githubUserId, body.syncId, githubUserId),
    env.DB.prepare(
      `INSERT INTO daily_activity (
         github_user_id, local_date, accepted_submission_count,
         distinct_problem_count, source_version, updated_at
       )
       SELECT incoming.github_user_id, staged.local_date,
              staged.accepted_submission_count,
              staged.distinct_problem_count, staged.source_version, ?
         FROM activity_sync_days AS staged
         JOIN activity_syncs AS incoming
           ON incoming.sync_id = staged.sync_id
         LEFT JOIN activity_snapshot_states AS applied
           ON applied.github_user_id = incoming.github_user_id
        WHERE incoming.sync_id = ?
          AND incoming.github_user_id = ?
          AND (
            applied.github_user_id IS NULL
            OR incoming.created_at > applied.applied_sync_created_at
            OR (
              incoming.created_at = applied.applied_sync_created_at
              AND incoming.sync_id > applied.applied_sync_id
            )
          )`,
    ).bind(updatedAt, body.syncId, githubUserId),
    env.DB.prepare(
      `INSERT INTO heatmap_settings (
         github_user_id, timezone, public_enabled, updated_at
       )
       SELECT incoming.github_user_id, incoming.timezone, 0, ?
         FROM activity_syncs AS incoming
         LEFT JOIN activity_snapshot_states AS applied
           ON applied.github_user_id = incoming.github_user_id
        WHERE incoming.sync_id = ?
          AND incoming.github_user_id = ?
          AND (
            applied.github_user_id IS NULL
            OR incoming.created_at > applied.applied_sync_created_at
            OR (
              incoming.created_at = applied.applied_sync_created_at
              AND incoming.sync_id > applied.applied_sync_id
            )
          )
       ON CONFLICT (github_user_id) DO UPDATE SET
         timezone = excluded.timezone,
         updated_at = excluded.updated_at`,
    ).bind(updatedAt, body.syncId, githubUserId),
    env.DB.prepare(
      `INSERT INTO activity_snapshot_states (
         github_user_id, applied_sync_id, applied_sync_created_at
       )
       SELECT incoming.github_user_id, incoming.sync_id, incoming.created_at
         FROM activity_syncs AS incoming
         LEFT JOIN activity_snapshot_states AS applied
           ON applied.github_user_id = incoming.github_user_id
        WHERE incoming.sync_id = ?
          AND incoming.github_user_id = ?
          AND (
            applied.github_user_id IS NULL
            OR incoming.created_at > applied.applied_sync_created_at
            OR (
              incoming.created_at = applied.applied_sync_created_at
              AND incoming.sync_id > applied.applied_sync_id
            )
          )
       ON CONFLICT (github_user_id) DO UPDATE SET
         applied_sync_id = excluded.applied_sync_id,
         applied_sync_created_at = excluded.applied_sync_created_at`,
    ).bind(body.syncId, githubUserId),
    env.DB.prepare(
      `DELETE FROM activity_sync_batches
        WHERE sync_id = ?
          AND EXISTS (
            SELECT 1 FROM activity_syncs
             WHERE sync_id = ? AND github_user_id = ?
               AND timezone = ? AND batch_count = ?
          )`,
    ).bind(
      body.syncId,
      body.syncId,
      githubUserId,
      body.timezone,
      body.batchCount,
    ),
    env.DB.prepare(
      `DELETE FROM activity_sync_days
        WHERE sync_id = ?
          AND EXISTS (
            SELECT 1 FROM activity_syncs
             WHERE sync_id = ? AND github_user_id = ?
               AND timezone = ? AND batch_count = ?
          )`,
    ).bind(
      body.syncId,
      body.syncId,
      githubUserId,
      body.timezone,
      body.batchCount,
    ),
    env.DB.prepare(
      `DELETE FROM activity_syncs
        WHERE sync_id = ? AND github_user_id = ?
          AND timezone = ? AND batch_count = ?`,
    ).bind(body.syncId, githubUserId, body.timezone, body.batchCount),
  ]);
  return json({ ok: true, complete: true, updatedAt });
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
