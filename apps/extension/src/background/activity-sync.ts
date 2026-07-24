import { API_BASE_URL } from "../shared/config";

import { database } from "./database";
import { readGitHubAuth, sessionToken } from "./auth";
import { readSettings } from "./settings";

const MAX_ACTIVITY_DAYS_PER_REQUEST = 400;
let activeActivitySync: Promise<boolean> | null = null;
let activitySyncRequested = false;

export function chunkActivityDays<T>(days: T[]): T[][] {
  if (days.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < days.length; index += MAX_ACTIVITY_DAYS_PER_REQUEST) {
    chunks.push(days.slice(index, index + MAX_ACTIVITY_DAYS_PER_REQUEST));
  }
  return chunks;
}

interface ActivityDayUpload {
  localDate: string;
  acceptedSubmissionCount: number;
  distinctProblemCount: number;
}

export function createActivitySnapshotPayloads(
  days: ActivityDayUpload[],
  timezone: string,
  syncId: string,
): Array<{
  sourceVersion: 1;
  timezone: string;
  syncId: string;
  batchIndex: number;
  batchCount: number;
  days: ActivityDayUpload[];
}> {
  const batches = chunkActivityDays(days);
  return batches.map((batch, batchIndex) => ({
    sourceVersion: 1,
    timezone,
    syncId,
    batchIndex,
    batchCount: batches.length,
    days: batch,
  }));
}

async function authenticatedPut(
  path: string,
  body: unknown,
  token: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? `热力图同步失败（${response.status}）`);
  }
}

export async function syncActivityToCloud(): Promise<boolean> {
  activitySyncRequested = true;
  activeActivitySync ??= drainActivitySyncRequests().finally(() => {
    activeActivitySync = null;
  });
  return activeActivitySync;
}

async function drainActivitySyncRequests(): Promise<boolean> {
  let synced = false;
  do {
    activitySyncRequested = false;
    synced = await syncActivitySnapshot();
  } while (activitySyncRequested);
  return synced;
}

async function syncActivitySnapshot(): Promise<boolean> {
  const [auth, token, settings] = await Promise.all([
    readGitHubAuth(),
    sessionToken(),
    readSettings(),
  ]);
  if (!auth.connected || !token) return false;

  const db = await database();
  const days = (await db.getAll("dailyActivity")).map((day) => ({
    localDate: day.localDate,
    acceptedSubmissionCount: day.acceptedSubmissionCount,
    distinctProblemCount: day.distinctProblemIds.length,
  }));
  const syncId = crypto.randomUUID();
  for (const payload of createActivitySnapshotPayloads(
    days,
    settings.timezone,
    syncId,
  )) {
    await authenticatedPut(
      "/v1/activity/days",
      payload,
      token,
    );
  }
  await authenticatedPut(
    "/v1/heatmap/settings",
    { publicEnabled: settings.heatmapPublicEnabled },
    token,
  );
  return true;
}
