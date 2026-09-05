import { describe, expect, it } from "vitest";

import { GitHubRepositoryClient } from "./github-api";

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("GitHubRepositoryClient", () => {
  it("verifies OAuth repo scope and repository write access before importing", async () => {
    const client = new GitHubRepositoryClient("token", async (input) => {
      const url = String(input);
      if (url.endsWith("/user")) {
        return json({}, 200, { "X-OAuth-Scopes": "read:user, repo" });
      }
      if (url.endsWith("/repos/octocat/solutions")) {
        return json({ permissions: { push: true } });
      }
      if (url.endsWith("/repos/octocat/solutions/git/ref/heads/main")) {
        return json({ ref: "refs/heads/main" });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(client.assertWritable("octocat/solutions", "main")).resolves.toBeUndefined();
  });

  it("rejects a GitHub App token before history data is pulled", async () => {
    const client = new GitHubRepositoryClient("token", async () => json({}));

    await expect(client.assertWritable("octocat/solutions", "main")).rejects.toThrow(
      "当前连接不是具有 repo 权限的 GitHub OAuth App",
    );
  });

  it("allows an empty writable repository to be bootstrapped by the commit client", async () => {
    const requests: string[] = [];
    const client = new GitHubRepositoryClient("token", async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/user")) {
        return json({}, 200, { "X-OAuth-Scopes": "repo" });
      }
      return json({ permissions: { push: true }, size: 0 });
    });

    await expect(client.assertWritable("octocat/empty", "main")).resolves.toBeUndefined();
    expect(requests).toHaveLength(2);
  });

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
