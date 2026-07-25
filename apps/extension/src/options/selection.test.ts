import { describe, expect, it } from "vitest";

import type { ExtensionSettings, GitHubRepositorySummary } from "../shared/messages";
import { autoSelectSingleRepository } from "./App";

const settings: ExtensionSettings = {
  timezone: "Asia/Shanghai",
  githubRepository: null,
  githubBranch: "main",
  githubRootDirectory: "",
  heatmapPublicEnabled: false,
};

const repository: GitHubRepositorySummary = {
  fullName: "octocat/leetcode-solutions",
  owner: "octocat",
  name: "leetcode-solutions",
  defaultBranch: "trunk",
  private: false,
};

describe("automatic repository selection", () => {
  it("selects and keeps the default branch for the only authorized repository", () => {
    expect(autoSelectSingleRepository(settings, [repository])).toMatchObject({
      githubRepository: "octocat/leetcode-solutions",
      githubBranch: "trunk",
    });
  });

  it("does not guess when there are multiple repositories or an existing choice", () => {
    expect(
      autoSelectSingleRepository(settings, [
        repository,
        { ...repository, fullName: "octocat/other", name: "other" },
      ]),
    ).toBeNull();
    expect(
      autoSelectSingleRepository({ ...settings, githubRepository: repository.fullName }, [
        repository,
      ]),
    ).toBeNull();
  });
});
