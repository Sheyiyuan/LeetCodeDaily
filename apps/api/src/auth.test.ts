import { describe, expect, it } from "vitest";

import { isAllowedAuthRedirect } from "./auth";

const env = {
  ALLOWED_EXTENSION_ORIGIN:
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
};

describe("GitHub auth redirect validation", () => {
  it("accepts only the configured Chrome identity callback host", () => {
    expect(
      isAllowedAuthRedirect(
        "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/github",
        env,
      ),
    ).toBe(true);
  });

  it("rejects another extension and non-HTTPS callbacks", () => {
    expect(
      isAllowedAuthRedirect(
        "https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/github",
        env,
      ),
    ).toBe(false);
    expect(
      isAllowedAuthRedirect(
        "http://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/github",
        env,
      ),
    ).toBe(false);
  });
});
