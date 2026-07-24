import { describe, expect, it } from "vitest";

import { GitHubAtomicCommitClient } from ".";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubAtomicCommitClient", () => {
  it("creates blobs, one tree, one commit, then advances the ref", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const queue = [
      response({ object: { sha: "parent-sha" } }),
      response({ tree: { sha: "base-tree-sha" } }),
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
    });
    expect(calls).toHaveLength(7);
    const treeBody = JSON.parse(String(calls[4]?.init.body));
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
    expect(calls[6]?.init.method).toBe("PATCH");
    expect(calls[6]?.init.headers).toMatchObject({
      Authorization: "Bearer short-lived-token",
    });
  });

  it("retries once when the ref update conflicts and reuses the latest branch tip", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const queue = [
      response({ object: { sha: "parent-sha-1" } }),
      response({ tree: { sha: "base-tree-1" } }),
      response({ sha: "readme-blob" }),
      response({ sha: "solution-blob" }),
      response({ sha: "tree-1" }),
      response({ sha: "commit-1" }),
      response({ message: "Reference update failed" }, 409),
      response({ object: { sha: "parent-sha-2" } }),
      response({ tree: { sha: "base-tree-2" } }),
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
    });
    expect(calls).toHaveLength(14);
    expect(calls[6]?.init.method).toBe("PATCH");
    expect(calls[13]?.init.method).toBe("PATCH");
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
});
