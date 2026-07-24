import { API_BASE_URL } from "../shared/config";

import { database } from "./database";
import { readGitHubAuth, sessionToken } from "./auth";
import { readSettings } from "./settings";

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
  await authenticatedPut(
    "/v1/activity/days",
    { sourceVersion: 1, timezone: settings.timezone, days },
    token,
  );
  await authenticatedPut(
    "/v1/heatmap/settings",
    { publicEnabled: settings.heatmapPublicEnabled },
    token,
  );
  return true;
}
