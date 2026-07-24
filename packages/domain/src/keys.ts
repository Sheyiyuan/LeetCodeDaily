import { LEETCODE_SITE } from "./model";

export function submissionKey(submissionId: string): string {
  const normalized = submissionId.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError("submissionId must contain only digits");
  }
  return `${LEETCODE_SITE}:${normalized}`;
}

export function candidateKey(
  titleSlug: string,
  observedAt: string,
  submissionId?: string | null,
): string {
  if (submissionId) return submissionKey(submissionId);
  return `${LEETCODE_SITE}:candidate:${titleSlug}:${observedAt}`;
}

export function problemKey(frontendId: string): string {
  return `${LEETCODE_SITE}:${frontendId.trim()}`;
}
