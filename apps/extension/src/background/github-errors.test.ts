import { GitHubSyncError } from "@leetcode-daily/github-sync";
import { describe, expect, it } from "vitest";

import {
  GITHUB_REPOSITORY_PERMISSION_MESSAGE,
  displayStoredSyncFailure,
  githubSyncFailureMessage,
} from "./github-errors";

describe("GitHub sync failure messages", () => {
  it("explains repository permission failures with recovery steps", () => {
    expect(
      githubSyncFailureMessage(
        new GitHubSyncError("Resource not accessible by integration", 403, false, "contents=write"),
      ),
    ).toBe(GITHUB_REPOSITORY_PERMISSION_MESSAGE);
  });

  it("upgrades permission errors already stored by older extension builds", () => {
    expect(displayStoredSyncFailure("Resource not accessible by integration")).toBe(
      GITHUB_REPOSITORY_PERMISSION_MESSAGE,
    );
  });

  it("keeps unrelated GitHub errors intact", () => {
    expect(
      githubSyncFailureMessage(new GitHubSyncError("API rate limit exceeded", 403, false)),
    ).toBe("API rate limit exceeded");
  });
});
