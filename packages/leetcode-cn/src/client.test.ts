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
    expect(result.canonicalUrl).toBe("https://leetcode.cn/problems/two-sum/");
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
              realName: null,
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

  it("maps the LeetCode display name separately from the user id", async () => {
    const client = new LeetCodeCnClient({
      fetch: async () =>
        jsonResponse({
          data: {
            userStatus: {
              isSignedIn: true,
              username: "vvi2ardly-visvesvarayaigk",
              realName: "YPSH",
              avatar: null,
            },
          },
        }),
    });

    await expect(client.getAccountStatus()).resolves.toMatchObject({
      username: "vvi2ardly-visvesvarayaigk",
      displayName: "YPSH",
    });
  });

  it("maps the Chinese accepted-question progress response", async () => {
    const client = new LeetCodeCnClient({
      fetch: async () =>
        jsonResponse({
          data: {
            userProfileUserQuestionProgressV2: {
              numAcceptedQuestions: [
                { difficulty: "EASY", count: 12 },
                { difficulty: "MEDIUM", count: 8 },
                { difficulty: "HARD", count: 2 },
              ],
            },
          },
        }),
    });

    await expect(client.getSolvedStats("yuhhhy")).resolves.toMatchObject({
      total: 22,
      easy: 12,
      medium: 8,
      hard: 2,
    });
  });

  it("loads solved problem slugs from the authenticated Chinese REST endpoint", async () => {
    let input: RequestInfo | URL | undefined;
    const client = new LeetCodeCnClient({
      fetch: async (nextInput) => {
        input = nextInput;
        return jsonResponse({
          user_name: "user-slug",
          stat_status_pairs: [
            {
              status: "ac",
              stat: {
                question_id: 1,
                question__title_slug: "two-sum",
                frontend_question_id: "1",
              },
            },
            {
              status: null,
              stat: {
                question_id: 2,
                question__title_slug: "add-two-numbers",
                frontend_question_id: "2",
              },
            },
          ],
        });
      },
    });

    await expect(client.getSolvedProblems()).resolves.toEqual([
      { questionId: "1", frontendId: "1", titleSlug: "two-sum" },
    ]);
    expect(input).toBe("https://leetcode.cn/api/problems/all/");
  });

  it("keeps the latest accepted submission for each language", async () => {
    let requestCount = 0;
    const client = new LeetCodeCnClient({
      fetch: async () => {
        requestCount += 1;
        return jsonResponse({
          data: {
            submissionList: {
              lastKey: null,
              hasNext: false,
              submissions: [
                {
                  id: "100",
                  titleSlug: "two-sum",
                  statusDisplay: "Accepted",
                  lang: "typescript",
                  timestamp: 100,
                  frontendId: "1",
                },
                {
                  id: "101",
                  titleSlug: "two-sum",
                  statusDisplay: "Accepted",
                  lang: "typescript",
                  timestamp: 200,
                  frontendId: "1",
                },
                {
                  id: "102",
                  titleSlug: "two-sum",
                  statusDisplay: "Accepted",
                  lang: "python3",
                  timestamp: 150,
                  frontendId: "1",
                },
              ],
            },
          },
        });
      },
    });

    await expect(client.getLatestAcceptedByLanguage("two-sum")).resolves.toEqual([
      {
        id: "102",
        titleSlug: "two-sum",
        language: "python3",
        timestamp: 150,
      },
      {
        id: "101",
        titleSlug: "two-sum",
        language: "typescript",
        timestamp: 200,
      },
    ]);
    expect(requestCount).toBe(1);
  });

  it("returns every accepted submission for history statistics", async () => {
    const client = new LeetCodeCnClient({
      fetch: async () =>
        jsonResponse({
          data: {
            submissionList: {
              lastKey: null,
              hasNext: false,
              submissions: [
                {
                  id: "100",
                  titleSlug: "two-sum",
                  statusDisplay: "Accepted",
                  lang: "typescript",
                  timestamp: 100,
                  frontendId: "1",
                },
                {
                  id: "101",
                  titleSlug: "two-sum",
                  statusDisplay: "Accepted",
                  lang: "typescript",
                  timestamp: 200,
                  frontendId: "1",
                },
              ],
            },
          },
        }),
    });

    await expect(client.getAcceptedSubmissions("two-sum")).resolves.toHaveLength(2);
  });

  it("reads only the first accepted page when resolving a live candidate", async () => {
    let requestCount = 0;
    let requestedLimit: unknown;
    const client = new LeetCodeCnClient({
      fetch: async (_input, init) => {
        requestCount += 1;
        const body = JSON.parse(String(init?.body)) as {
          variables?: { limit?: unknown };
        };
        requestedLimit = body.variables?.limit;
        return jsonResponse({
          data: {
            submissionList: {
              lastKey: "next-page",
              hasNext: true,
              submissions: [
                {
                  id: "103",
                  statusDisplay: "Accepted",
                  lang: "typescript",
                  timestamp: 300,
                },
              ],
            },
          },
        });
      },
    });

    await expect(client.getRecentAcceptedSubmissions("two-sum", 100)).resolves.toEqual([
      {
        id: "103",
        titleSlug: "two-sum",
        language: "typescript",
        timestamp: 300,
      },
    ]);
    expect(requestCount).toBe(1);
    expect(requestedLimit).toBe(20);
  });
});
