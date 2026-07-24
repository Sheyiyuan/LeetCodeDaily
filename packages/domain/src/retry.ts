export function retryDelayMs(
  attempt: number,
  options: {
    baseMs?: number;
    maxMs?: number;
    jitterRatio?: number;
    random?: () => number;
  } = {},
): number {
  const {
    baseMs = 2_000,
    maxMs = 15 * 60_000,
    jitterRatio = 0.2,
    random = Math.random,
  } = options;

  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError("attempt must be a positive integer");
  }

  const exponential = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  const jitter = exponential * jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}
