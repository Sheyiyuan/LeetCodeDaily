import { describe, expect, it } from "vitest";

import { GitHubAtomicCommitClient } from ".";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function decodeUtf8Base64(value: string): string {
  const bytes = Uint8Array.from(atob(value), (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}

describe("GitHubAtomicCommitClient", () => {
  it("creates blobs, one tree, one commit, then advances the ref", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const queue = [
      response({ object: { sha: "parent-sha" } }),
      response({ tree: { sha: "base-tree-sha" } }),
      response({
        tree: [
          { path: "other.md", type: "blob", sha: "other-blob" },
        ],
      }),
      response({ sha: "readme-blob" }),
      response({ sha: "solution-blob" }),
      response({ sha: "new-tree-sha" }),
      response({ sha: "new-commit-sha" }),
      response({ ref: "refs/heads/main" }),
    ];
    const client = new GitHubAtomicCommitClient({
      token: "short-lived-token",
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        const next = queue.shift();
        if (!next) throw new Error("Unexpected request");
        return next;
      },
    });

    const result = await client.commitFiles({
      owner: "octocat",
      repository: "leetcode",
      branch: "main",
      message: "solve: 1 two-sum (cpp)",
      files: [
        { path: "solutions/1-two-sum/README.md", content: "# Two Sum" },
        {
          path: "solutions/1-two-sum/solution.cpp",
          content: "return {};",
        },
      ],
    });

    expect(result).toEqual({
      commitSha: "new-commit-sha",
      treeSha: "new-tree-sha",
      changed: true,
    });
    expect(calls).toHaveLength(8);
    const treeBody = JSON.parse(String(calls[5]?.init.body));
    expect(treeBody).toEqual({
      base_tree: "base-tree-sha",
      tree: [
        {
          path: "solutions/1-two-sum/README.md",
          mode: "100644",
          type: "blob",
          sha: "readme-blob",
        },
        {
          path: "solutions/1-two-sum/solution.cpp",
          mode: "100644",
          type: "blob",
          sha: "solution-blob",
        },
      ],
    });
    expect(calls[7]?.init.method).toBe("PATCH");
    expect(calls[7]?.init.headers).toMatchObject({
      Authorization: "Bearer short-lived-token",
    });
  });

  it("retries once when the ref update conflicts and reuses the latest branch tip", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const queue = [
      response({ object: { sha: "parent-sha-1" } }),
      response({ tree: { sha: "base-tree-1" } }),
      response({ tree: [] }),
      response({ sha: "readme-blob" }),
      response({ sha: "solution-blob" }),
      response({ sha: "tree-1" }),
      response({ sha: "commit-1" }),
      response({ message: "Reference update failed" }, 409),
      response({ object: { sha: "parent-sha-2" } }),
      response({ tree: { sha: "base-tree-2" } }),
      response({ tree: [] }),
      response({ sha: "readme-blob" }),
      response({ sha: "solution-blob" }),
      response({ sha: "tree-2" }),
      response({ sha: "commit-2" }),
      response({ ref: "refs/heads/main" }),
    ];
    const client = new GitHubAtomicCommitClient({
      token: "short-lived-token",
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        const next = queue.shift();
        if (!next) throw new Error("Unexpected request");
        return next;
      },
    });

    const result = await client.commitFiles({
      owner: "octocat",
      repository: "leetcode",
      branch: "main",
      message: "solve: 1 two-sum (cpp)",
      files: [
        { path: "solutions/1-two-sum/README.md", content: "# Two Sum" },
        {
          path: "solutions/1-two-sum/solution.cpp",
          content: "return {};",
        },
      ],
    });

    expect(result).toEqual({
      commitSha: "commit-2",
      treeSha: "tree-2",
      changed: true,
    });
    expect(calls).toHaveLength(16);
    expect(calls[7]?.init.method).toBe("PATCH");
    expect(calls[15]?.init.method).toBe("PATCH");
  });

  it("initializes an empty repository before creating the atomic solution commit", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const queue = [
      response({ message: "Git Repository is empty." }, 409),
      response({ commit: { sha: "bootstrap-commit" } }, 201),
      response({ object: { sha: "bootstrap-commit" } }),
      response({ tree: { sha: "bootstrap-tree" } }),
      response({ tree: [] }),
      response({ sha: "readme-blob" }),
      response({ sha: "solution-blob" }),
      response({ sha: "solution-tree" }),
      response({ sha: "solution-commit" }),
      response({ ref: "refs/heads/main" }),
    ];
    const client = new GitHubAtomicCommitClient({
      token: "short-lived-token",
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        const next = queue.shift();
        if (!next) throw new Error("Unexpected request");
        return next;
      },
    });

    await expect(
      client.commitFiles({
        owner: "octocat",
        repository: "empty-repository",
        branch: "main",
        message: "solve: 1 two-sum (cpp)",
        files: [
          { path: "solutions/1-two-sum/README.md", content: "# 两数之和" },
          {
            path: "solutions/1-two-sum/solution.cpp",
            content: "return {};",
          },
        ],
      }),
    ).resolves.toEqual({
      commitSha: "solution-commit",
      treeSha: "solution-tree",
      changed: true,
    });

    expect(calls).toHaveLength(10);
    expect(calls[1]?.url).toContain(
      "/contents/solutions/1-two-sum/README.md",
    );
    expect(calls[1]?.init.method).toBe("PUT");
    const bootstrapBody = JSON.parse(String(calls[1]?.init.body));
    expect(bootstrapBody.message).toBe(
      "chore: initialize repository for LeetCodeDaily",
    );
    expect(decodeUtf8Base64(bootstrapBody.content)).toBe("# 两数之和");
    expect(calls[9]?.init.method).toBe("PATCH");
  });

  it("skips the commit when all target files already match", async () => {
    const calls: string[] = [];
    const client = new GitHubAtomicCommitClient({
      token: "short-lived-token",
      fetch: async (input) => {
        calls.push(String(input));
        const path = String(input);
        if (path.endsWith("/git/ref/heads/main")) {
          return response({ object: { sha: "parent-sha" } });
        }
        if (path.endsWith("/git/commits/parent-sha")) {
          return response({ tree: { sha: "base-tree-sha" } });
        }
        if (path.includes("/git/trees/base-tree-sha")) {
          return response({
            tree: [
              { path: "README.md", type: "blob", sha: "readme-sha" },
              { path: "solution.cpp", type: "blob", sha: "solution-sha" },
            ],
          });
        }
        if (path.endsWith("/git/blobs/readme-sha")) {
          return response({
            encoding: "base64",
            content: btoa("# Two Sum"),
          });
        }
        if (path.endsWith("/git/blobs/solution-sha")) {
          return response({
            encoding: "base64",
            content: btoa("return {};"),
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    });

    await expect(
      client.commitFiles({
        owner: "octocat",
        repository: "leetcode",
        branch: "main",
        message: "solve: no-op",
        files: [
          { path: "README.md", content: "# Two Sum" },
          { path: "solution.cpp", content: "return {};" },
        ],
      }),
    ).resolves.toEqual({
      commitSha: "parent-sha",
      treeSha: "base-tree-sha",
      changed: false,
    });
    expect(calls).toHaveLength(5);
    expect(calls.every((call) => !call.endsWith("/git/commits"))).toBe(true);
  });

  it("rejects unsafe repository paths before any API request", async () => {
    let called = false;
    const client = new GitHubAtomicCommitClient({
      token: "token",
      fetch: async () => {
        called = true;
        return response({});
      },
    });

    await expect(
      client.commitFiles({
        owner: "octocat",
        repository: "leetcode",
        branch: "main",
        message: "bad",
        files: [{ path: "../README.md", content: "bad" }],
      }),
    ).rejects.toThrow("unsafe repository path");
    expect(called).toBe(false);
  });

  it("invokes the Worker global fetch with the correct receiver", async () => {
    const originalFetch = globalThis.fetch;
    let receiver: unknown;
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(response({ message: "not found" }, 404));
    } as typeof fetch;

    try {
      await expect(
        new GitHubAtomicCommitClient({ token: "token" }).commitFiles({
          owner: "octocat",
          repository: "leetcode",
          branch: "main",
          message: "solve: two sum",
          files: [{ path: "README.md", content: "# Two Sum" }],
        }),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(receiver).toBe(globalThis);
  });

  it("preserves GitHub's required repository permissions on API errors", async () => {
    const client = new GitHubAtomicCommitClient({
      token: "token",
      fetch: async () =>
        new Response(
          JSON.stringify({ message: "Resource not accessible by integration" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "X-Accepted-GitHub-Permissions": "contents=write",
            },
          },
        ),
    });

    await expect(
      client.commitFiles({
        owner: "octocat",
        repository: "leetcode",
        branch: "main",
        message: "solve: two sum",
        files: [{ path: "README.md", content: "# Two Sum" }],
      }),
    ).rejects.toMatchObject({
      status: 403,
      retryable: false,
      acceptedPermissions: "contents=write",
    });
  });
});
