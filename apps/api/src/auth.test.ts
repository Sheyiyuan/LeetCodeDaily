import { describe, expect, it } from "vitest";

import { isAllowedAuthRedirect } from "./auth";

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
