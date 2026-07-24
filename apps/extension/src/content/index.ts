import {
  isAcceptedResultText,
  submissionIdFromUrl,
  SUBMISSION_RESULT_SELECTOR,
  SUBMIT_BUTTON_SELECTOR,
  titleSlugFromPathname,
} from "./detector";

let lastFingerprint = "";
let awaitingSubmission = false;
let acceptedObservedAt: string | null = null;
let submissionIdAtClick: string | null = null;
let expiryTimer: number | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !message ||
    message.type !== "leetcode-proxy-request" ||
    typeof message.body !== "string"
  ) {
    return false;
  }

  void fetch("https://leetcode.cn/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: message.body,
  })
    .then(async (response) =>
      sendResponse({
        ok: true,
        status: response.status,
        body: await response.text(),
      }),
    )
    .catch(() => sendResponse({ ok: false }));
  return true;
});

function currentTitleSlug(): string | null {
  return titleSlugFromPathname(location.pathname);
}

function firstSubmissionIdInDocument(): string | null {
  const href = document
    .querySelector<HTMLAnchorElement>('a[href*="/submissions/"]')
    ?.getAttribute("href");
  return href ? submissionIdFromUrl(href) : null;
}

function submissionIdNear(element: Element): string | null {
  const currentSubmissionId = submissionIdFromUrl(location.href);
  if (currentSubmissionId) return currentSubmissionId;

  const closestLink = element.closest<HTMLAnchorElement>(
    'a[href*="/submissions/"]',
  );
  const scopedLink = element
    .closest("section, main, div")
    ?.querySelector<HTMLAnchorElement>('a[href*="/submissions/"]');
  const globalLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/submissions/"]',
  );
  const href =
    closestLink?.getAttribute("href") ??
    scopedLink?.getAttribute("href") ??
    globalLinks.item(0)?.getAttribute("href") ??
    "";
  return submissionIdFromUrl(href);
}

function acceptedElementIn(node: Node): Element | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!element) return null;

  let current: Element | null = element;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (isAcceptedResultText(current.textContent)) return current;
    current = current.parentElement;
  }

  const stableResult = element.matches(SUBMISSION_RESULT_SELECTOR)
    ? element
    : element.querySelector(SUBMISSION_RESULT_SELECTOR);
  if (stableResult && isAcceptedResultText(stableResult.textContent)) {
    return stableResult;
  }

  for (const candidate of element.querySelectorAll("span, div")) {
    if (isAcceptedResultText(candidate.textContent)) return candidate;
  }
  return null;
}

function finishObservation(): void {
  awaitingSubmission = false;
  acceptedObservedAt = null;
  submissionIdAtClick = null;
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
}

function inspectMutationNode(node: Node, detectAcceptance = true): void {
  if (!awaitingSubmission) return;

  const acceptedElement = detectAcceptance ? acceptedElementIn(node) : null;
  if (acceptedElement && !acceptedObservedAt) {
    acceptedObservedAt = new Date().toISOString();
  }
  if (!acceptedObservedAt) return;

  const contextElement = acceptedElement ?? document.documentElement;
  const submissionId = submissionIdNear(contextElement);
  if (!submissionId || submissionId === submissionIdAtClick) return;

  const titleSlug = currentTitleSlug();
  if (!titleSlug) return;

  const fingerprint = `${titleSlug}:${submissionId}`;
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  const observedAt = acceptedObservedAt;
  finishObservation();

  void chrome.runtime.sendMessage({
    type: "accepted-observed",
    payload: {
      submissionId,
      titleSlug,
      observedAt,
    },
  });
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(SUBMIT_BUTTON_SELECTOR)) {
      return;
    }

    awaitingSubmission = true;
    acceptedObservedAt = null;
    submissionIdAtClick =
      submissionIdFromUrl(location.href) ?? firstSubmissionIdInDocument();
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    expiryTimer = window.setTimeout(finishObservation, 2 * 60 * 1_000);
  },
  true,
);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (acceptedObservedAt) inspectMutationNode(mutation.target, false);
    if (mutation.type === "characterData") {
      inspectMutationNode(mutation.target);
    } else if (
      mutation.type === "attributes" &&
      mutation.target instanceof Element &&
      mutation.target.matches(SUBMISSION_RESULT_SELECTOR)
    ) {
      inspectMutationNode(mutation.target);
    }
    for (const node of mutation.addedNodes) {
      inspectMutationNode(node);
    }
  }
});

observer.observe(document.documentElement, {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
});
