import { aggregateDailyActivity } from "@leetcode-daily/domain";

import { database } from "./database";
import { readSettings } from "./settings";

export async function rebuildDailyActivity(): Promise<void> {
  const [db, settings] = await Promise.all([database(), readSettings()]);
  const [historical, hydrated] = await Promise.all([
    db.getAll("historicalAccepted"),
    db.getAll("submissions"),
  ]);
  const acceptedById = new Map(
    [...historical, ...hydrated].map((submission) => [
      submission.submissionId,
      submission,
    ]),
  );
  const activity = aggregateDailyActivity(
    [...acceptedById.values()],
    settings.timezone,
  );
  const transaction = db.transaction("dailyActivity", "readwrite");
  await transaction.store.clear();
  for (const day of activity) await transaction.store.put(day);
  await transaction.done;
}
