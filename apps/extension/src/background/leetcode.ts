import { LeetCodeCnClient } from "@leetcode-daily/leetcode-cn";

interface ProxyResponse {
  ok: boolean;
  status?: number;
  body?: string;
}

async function tabsWithLeetCode(): Promise<chrome.tabs.Tab[]> {
  const [focused, all] = await Promise.all([
    chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
      url: ["https://leetcode.cn/*"],
    }),
    chrome.tabs.query({ url: ["https://leetcode.cn/*"] }),
  ]);
  const seen = new Set<number>();
  return [...focused, ...all].filter((tab) => {
    if (typeof tab.id !== "number" || seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}

const ALLOWED_URLS = new Set([
  "https://leetcode.cn/graphql/",
  "https://leetcode.cn/api/problems/all/",
]);

async function fetchThroughLeetCodePage(
  url: string,
  method: string,
  body: string | null,
): Promise<Response | null> {
  if (!ALLOWED_URLS.has(url)) return null;
  for (const tab of await tabsWithLeetCode()) {
    if (typeof tab.id !== "number") continue;
    try {
      const result = (await chrome.tabs.sendMessage(tab.id, {
        type: "leetcode-proxy-request",
        url,
        method,
        body,
      })) as ProxyResponse | undefined;
      if (!result?.ok || typeof result.body !== "string") continue;
      return new Response(result.body, {
        status: result.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // The tab may have navigated before its content script received the request.
    }
  }
  return null;
}

async function leetcodeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? init.body : null;
  return (
    (await fetchThroughLeetCodePage(url, method, body)) ?? fetch(input, init)
  );
}

export const leetcodeClient = new LeetCodeCnClient({ fetch: leetcodeFetch });
