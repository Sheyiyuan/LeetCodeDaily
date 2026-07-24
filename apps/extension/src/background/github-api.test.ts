import { describe, expect, it } from "vitest";

import { GitHubRepositoryClient } from "./github-api";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubRepositoryClient", () => {
  it("lists repositories from every installation and removes duplicates", async () => {
    const client = new GitHubRepositoryClient("token", async (input) => {
      const url = String(input);
      if (url.includes("/user/installations?")) {
        return json({ installations: [{ id: 10 }, { id: 20 }] });
      }
      if (url.includes("/user/installations/10/repositories")) {
        return json({
          repositories: [
            {
              name: "solutions",
              full_name: "octocat/solutions",
              private: false,
              default_branch: "main",
              owner: { login: "octocat" },
            },
          ],
        });
      }
      if (url.includes("/user/installations/20/repositories")) {
        return json({
          repositories: [
            {
              name: "solutions",
              full_name: "octocat/solutions",
              private: false,
              default_branch: "main",
              owner: { login: "octocat" },
            },
            {
              name: "private-solutions",
              full_name: "octocat/private-solutions",
              private: true,
              default_branch: "trunk",
              owner: { login: "octocat" },
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(client.listAuthorizedRepositories()).resolves.toEqual([
      {
        fullName: "octocat/private-solutions",
        owner: "octocat",
        name: "private-solutions",
        defaultBranch: "trunk",
        private: true,
      },
      {
        fullName: "octocat/solutions",
        owner: "octocat",
        name: "solutions",
        defaultBranch: "main",
        private: false,
      },
    ]);
  });

  it("loads and sorts repository branches", async () => {
    const client = new GitHubRepositoryClient("token", async () =>
      json([{ name: "release" }, { name: "main" }]),
    );

    await expect(client.listBranches("octocat/solutions")).resolves.toEqual([
      "main",
      "release",
    ]);
  });
});
