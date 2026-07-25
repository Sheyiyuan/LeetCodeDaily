import { describe, expect, it } from "vitest";

import { allowedExtensionOrigins, isAllowedExtensionOrigin } from "./extension-origin";

describe("extension origin allowlist", () => {
  const env = {
    ALLOWED_EXTENSION_ORIGIN:
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop, chrome-extension://cccccccccccccccccccccccccccccccc",
  };

  it("parses comma-separated extension origins", () => {
    expect(allowedExtensionOrigins(env)).toEqual([
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      "chrome-extension://cccccccccccccccccccccccccccccccc",
    ]);
  });

  it("does not accept an extension outside the allowlist", () => {
    expect(
      isAllowedExtensionOrigin("chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", env),
    ).toBe(false);
  });
});
