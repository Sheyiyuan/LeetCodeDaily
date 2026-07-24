import type { DailyActivity, Submission } from "./model";

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function localDateForInstant(
  instant: string | Date,
  timezone: string,
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid instant");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");

  if (!year || !month || !day) {
    throw new RangeError(`Unable to format date in timezone ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}

export function aggregateDailyActivity(
  submissions: Submission[],
  timezone: string,
): DailyActivity[] {
  const buckets = new Map<
    string,
    { submissionIds: Set<string>; problemIds: Set<string> }
  >();

  for (const submission of submissions) {
    const localDate = localDateForInstant(submission.submittedAt, timezone);
    const bucket = buckets.get(localDate) ?? {
      submissionIds: new Set<string>(),
      problemIds: new Set<string>(),
    };
    bucket.submissionIds.add(submission.submissionId);
    bucket.problemIds.add(submission.problemId);
    buckets.set(localDate, bucket);
  }

  const updatedAt = new Date().toISOString();
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([localDate, bucket]) => ({
      localDate,
      timezone,
      acceptedSubmissionCount: bucket.submissionIds.size,
      distinctProblemIds: [...bucket.problemIds].sort(),
      updatedAt,
    }));
}

export function activityLevel(distinctProblemCount: number): 0 | 1 | 2 | 3 | 4 {
  if (distinctProblemCount <= 0) return 0;
  if (distinctProblemCount === 1) return 1;
  if (distinctProblemCount === 2) return 2;
  if (distinctProblemCount <= 4) return 3;
  return 4;
}
