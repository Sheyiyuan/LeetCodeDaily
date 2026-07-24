import {
  isFreshAcceptedResultText,
  SUBMISSION_RESULT_SELECTOR,
  SUBMIT_BUTTON_SELECTOR,
  submissionIdFromUrl,
  titleSlugFromPathname,
} from "./detector";

let lastFingerprint = "";
let awaitingSubmission = false;
let acceptedObservedAt: string | null = null;
let submissionIdAtClick: string | null = null;
let expiryTimer: number | null = null;
let submissionIdGraceTimer: number | null = null;
let resultBaselines = new WeakMap<Element, string>();

const ALLOWED_PROXY_URLS = new Set([
  "https://leetcode.cn/graphql/",
  "https://leetcode.cn/api/problems/all/",
]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== "leetcode-proxy-request" ||
    typeof message.url !== "string" ||
    !ALLOWED_PROXY_URLS.has(message.url) ||
    (message.method !== "GET" && message.method !== "POST") ||
    (message.body !== null && typeof message.body !== "string")
  ) {
    return false;
  }

  const proxyInit: RequestInit = {
    method: message.method,
    credentials: "include",
  };
  if (message.method === "POST") {
    proxyInit.headers = { "Content-Type": "application/json" };
    proxyInit.body = message.body;
  }

  void fetch(message.url, proxyInit)
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

  const closestLink = element.closest<HTMLAnchorElement>('a[href*="/submissions/"]');
  const scopedLink = element
    .closest("section, main, div")
    ?.querySelector<HTMLAnchorElement>('a[href*="/submissions/"]');
  const globalLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="/submissions/"]');
  const href =
    closestLink?.getAttribute("href") ??
    scopedLink?.getAttribute("href") ??
    globalLinks.item(0)?.getAttribute("href") ??
    "";
  return submissionIdFromUrl(href);
}

function acceptedElementIn(node: Node): Element | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!element) return null;

  const result = element.matches(SUBMISSION_RESULT_SELECTOR)
    ? element
    : (element.closest(SUBMISSION_RESULT_SELECTOR) ??
      element.querySelector(SUBMISSION_RESULT_SELECTOR));
  if (!result) return null;

  const currentText = result.textContent ?? "";
  const isFresh = isFreshAcceptedResultText(currentText, resultBaselines.get(result));
  resultBaselines.set(result, currentText);
  return isFresh ? result : null;
}

function finishObservation(): void {
  awaitingSubmission = false;
  acceptedObservedAt = null;
  submissionIdAtClick = null;
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  if (submissionIdGraceTimer !== null) {
    window.clearTimeout(submissionIdGraceTimer);
  }
  expiryTimer = null;
  submissionIdGraceTimer = null;
  resultBaselines = new WeakMap<Element, string>();
}

function emitAccepted(submissionId: string | null): void {
  if (!awaitingSubmission || !acceptedObservedAt) return;

  const titleSlug = currentTitleSlug();
  if (!titleSlug) return;
  const fingerprint = submissionId
    ? `${titleSlug}:${submissionId}`
    : `${titleSlug}:${acceptedObservedAt}`;
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  const observedAt = acceptedObservedAt;
  const previousSubmissionId = submissionIdAtClick;
  finishObservation();

  console.info("[LeetCodeDaily] Accepted result observed", {
    titleSlug,
    hasSubmissionId: Boolean(submissionId),
  });
  void chrome.runtime
    .sendMessage({
      type: "accepted-observed",
      payload: {
        submissionId,
        previousSubmissionId,
        titleSlug,
        observedAt,
      },
    })
    .catch((cause: unknown) => {
      console.warn(
        "[LeetCodeDaily] failed to send Accepted event",
        cause instanceof Error ? cause.message : "unknown error",
      );
    });
}

function inspectMutationNode(node: Node, detectAcceptance = true): void {
  if (!awaitingSubmission) return;

  const acceptedElement = detectAcceptance ? acceptedElementIn(node) : null;
  if (acceptedElement && !acceptedObservedAt) {
    acceptedObservedAt = new Date().toISOString();
    submissionIdGraceTimer = window.setTimeout(() => emitAccepted(null), 1_500);
  }
  if (!acceptedObservedAt) return;

  const contextElement = acceptedElement ?? document.documentElement;
  const submissionId = submissionIdNear(contextElement);
  if (!submissionId || submissionId === submissionIdAtClick) return;

  emitAccepted(submissionId);
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(SUBMIT_BUTTON_SELECTOR)) {
      return;
    }

    finishObservation();
    resultBaselines = new WeakMap<Element, string>();
    let existingResultCount = 0;
    for (const result of document.querySelectorAll(SUBMISSION_RESULT_SELECTOR)) {
      resultBaselines.set(result, result.textContent ?? "");
      existingResultCount += 1;
    }
    awaitingSubmission = true;
    submissionIdAtClick = submissionIdFromUrl(location.href) ?? firstSubmissionIdInDocument();
    console.info("[LeetCodeDaily] submit observed", {
      titleSlug: currentTitleSlug(),
      hadExistingResult: existingResultCount > 0,
    });
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

console.info("[LeetCodeDaily] content script ready", {
  pathname: location.pathname,
});
