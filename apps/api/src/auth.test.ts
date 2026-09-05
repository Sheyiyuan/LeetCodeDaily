import { describe, expect, it } from "vitest";

import { hasOAuthRepoScope, isAllowedAuthRedirect } from "./auth";

const env = {
  ALLOWED_EXTENSION_ORIGIN:
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop, chrome-extension://cccccccccccccccccccccccccccccccc",
};

describe("GitHub auth redirect validation", () => {
  it("accepts every configured Chrome identity callback host", () => {
    expect(
      isAllowedAuthRedirect("https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/github", env),
    ).toBe(true);
    expect(
      isAllowedAuthRedirect("https://cccccccccccccccccccccccccccccccc.chromiumapp.org/github", env),
    ).toBe(true);
  });

  it("rejects another extension and non-HTTPS callbacks", () => {
    expect(
      isAllowedAuthRedirect("https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/github", env),
    ).toBe(false);
    expect(
      isAllowedAuthRedirect("http://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/github", env),
    ).toBe(false);
  });
});

describe("GitHub OAuth scope validation", () => {
  it("accepts the classic repo scope among other scopes", () => {
    expect(hasOAuthRepoScope("read:user, repo, user:email")).toBe(true);
  });

  it("rejects GitHub App and read-only OAuth credentials", () => {
    expect(hasOAuthRepoScope(null)).toBe(false);
    expect(hasOAuthRepoScope("")).toBe(false);
    expect(hasOAuthRepoScope("read:user, public_repo")).toBe(false);
  });
});
