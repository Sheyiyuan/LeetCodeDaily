const ACCEPTED_PATTERN = /(?:^|\s)(?:通过|Accepted)(?:\s|$)/;
const REJECTED_PATTERN = /未通过|不通过|Wrong Answer|Runtime Error/;
const SUBMISSION_DETAIL_PATTERN = /\/submissions\/detail\/(\d+)\/?/;

let lastFingerprint = "";

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
  return (
    location.pathname.match(/^\/problems\/([^/]+)/)?.[1] ??
    location.pathname.match(/^\/problemset\/[^/]+\/([^/]+)/)?.[1] ??
    null
  );
}

function submissionIdNear(element: Element): string | null {
  const scopedLink = element
    .closest("section, main, div")
    ?.querySelector<HTMLAnchorElement>('a[href*="/submissions/detail/"]');
  const globalLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/submissions/detail/"]',
  );
  const href =
    scopedLink?.getAttribute("href") ??
    globalLinks.item(globalLinks.length - 1)?.getAttribute("href") ??
    "";
  return href.match(SUBMISSION_DETAIL_PATTERN)?.[1] ?? null;
}

function inspectAddedNode(node: Node): void {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!element) return;

  const text = element.textContent?.trim() ?? "";
  if (
    text.length === 0 ||
    text.length > 2_000 ||
    !ACCEPTED_PATTERN.test(text) ||
    REJECTED_PATTERN.test(text)
  ) {
    return;
  }

  const titleSlug = currentTitleSlug();
  if (!titleSlug) return;

  const submissionId = submissionIdNear(element);
  const fingerprint = `${titleSlug}:${submissionId ?? "unknown"}:${text.slice(0, 80)}`;
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;

  void chrome.runtime.sendMessage({
    type: "accepted-observed",
    payload: {
      submissionId,
      titleSlug,
      observedAt: new Date().toISOString(),
    },
  });
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      inspectAddedNode(node);
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
