import type { DailyActivity } from "@leetcode-daily/domain";

export function calculateCurrentStreak(
  days: Array<Pick<DailyActivity, "localDate" | "acceptedSubmissionCount">>,
  today: string,
): number {
  const activeDates = new Set(
    days
      .filter((day) => day.acceptedSubmissionCount > 0)
      .map((day) => day.localDate),
  );
  let date = today;
  let streak = 0;
  while (activeDates.has(date)) {
    streak += 1;
    date = previousDate(date);
  }
  return streak;
}

function previousDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1));
  return date.toISOString().slice(0, 10);
}
