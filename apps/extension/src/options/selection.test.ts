import { describe, expect, it } from "vitest";

import { repositoryIsValid } from "./App";

describe("manual repository validation", () => {
  it("accepts owner/repository names", () => {
    expect(repositoryIsValid("octocat/leetcode-solutions")).toBe(true);
    expect(repositoryIsValid("octocat/leetcode-daily")).toBe(true);
  });

  it("rejects missing owner, repository, or whitespace", () => {
    expect(repositoryIsValid(null)).toBe(true);
    expect(repositoryIsValid("octocat")).toBe(false);
    expect(repositoryIsValid("/leetcode-daily")).toBe(false);
    expect(repositoryIsValid("octocat/leetcode-daily/extra")).toBe(false);
    expect(repositoryIsValid("octocat/leetcode daily")).toBe(false);
  });
});
