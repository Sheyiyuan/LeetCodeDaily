import { describe, expect, it } from "vitest";

import { LeetCodeCnClient } from ".";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LeetCodeCnClient", () => {
  it("maps the verified Chinese question response", async () => {
    const client = new LeetCodeCnClient({
      fetch: async () =>
        jsonResponse({
          data: {
            question: {
              questionId: "1",
              questionFrontendId: "1",
              title: "Two Sum",
              translatedTitle: "两数之和",
              titleSlug: "two-sum",
              difficulty: "Easy",
              content: "<p>English</p>",
              translatedContent: "<p>中文</p>",
              topicTags: [
                {
                  name: "Array",
                  translatedName: "数组",
                  slug: "array",
                },
              ],
            },
          },
        }),
    });

    const result = await client.getQuestion("two-sum");
    expect(result.translatedTitle).toBe("两数之和");
    expect(result.canonicalUrl).toBe(
      "https://leetcode.cn/problems/two-sum/",
    );
  });

  it("always sends credentials to leetcode.cn", async () => {
    let input: RequestInfo | URL | undefined;
    let init: RequestInit | undefined;
    const client = new LeetCodeCnClient({
      fetch: async (nextInput, nextInit) => {
        input = nextInput;
        init = nextInit;
        return jsonResponse({
          data: {
            userStatus: {
              isSignedIn: false,
              username: "",
              avatar: null,
            },
          },
        });
      },
    });

    await client.getAccountStatus();
    expect(input).toBe("https://leetcode.cn/graphql/");
    expect(init?.credentials).toBe("include");
  });
});
