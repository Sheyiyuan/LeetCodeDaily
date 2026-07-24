export const SUBMIT_BUTTON_SELECTOR =
  'button[data-e2e-locator="console-submit-button"]';
export const SUBMISSION_RESULT_SELECTOR =
  '[data-e2e-locator="submission-result"]';

const SUBMISSION_PATH_PATTERNS = [
  /\/problems\/[^/]+\/submissions\/(\d+)\/?/,
  /\/submissions\/detail\/(\d+)\/?/,
];

export function titleSlugFromPathname(pathname: string): string | null {
  return (
    pathname.match(/^\/problems\/([^/]+)/)?.[1] ??
    pathname.match(/^\/problemset\/[^/]+\/([^/]+)/)?.[1] ??
    null
  );
}

export function submissionIdFromUrl(value: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(value, "https://leetcode.cn").pathname;
  } catch {
    return null;
  }

  for (const pattern of SUBMISSION_PATH_PATTERNS) {
    const submissionId = pathname.match(pattern)?.[1];
    if (submissionId) return submissionId;
  }
  return null;
}

export function isAcceptedResultText(value: string | null | undefined): boolean {
  const normalized = value?.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized === "通过" || normalized === "accepted";
}
