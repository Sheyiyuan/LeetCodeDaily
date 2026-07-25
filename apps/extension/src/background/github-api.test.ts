import { describe, expect, it } from "vitest";

import { GitHubRepositoryClient } from "./github-api";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubRepositoryClient", () => {
  it("loads the default branch before the remaining branches", async () => {
    const client = new GitHubRepositoryClient("token", async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/octocat/solutions")) {
        return json({ default_branch: "trunk" });
      }
      if (url.includes("/repos/octocat/solutions/branches")) {
        return json([{ name: "release" }, { name: "trunk" }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(client.listBranches("octocat/solutions")).resolves.toEqual(["trunk", "release"]);
  });

  it("loads and sorts repository branches", async () => {
    const client = new GitHubRepositoryClient("token", async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/octocat/solutions")) return json({ default_branch: "main" });
      return json([{ name: "release" }, { name: "main" }]);
    });

    await expect(client.listBranches("octocat/solutions")).resolves.toEqual(["main", "release"]);
  });

  it("invokes the Worker global fetch with the correct receiver", async () => {
    const originalFetch = globalThis.fetch;
    let receiver: unknown;
    globalThis.fetch = function (this: unknown, input) {
      receiver = this;
      const url = String(input);
      if (url.endsWith("/repos/octocat/solutions")) {
        return Promise.resolve(json({ default_branch: "main" }));
      }
      return Promise.resolve(json([]));
    } as typeof fetch;

    try {
      await expect(
        new GitHubRepositoryClient("token").listBranches("octocat/solutions"),
      ).resolves.toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(receiver).toBe(globalThis);
  });
});
