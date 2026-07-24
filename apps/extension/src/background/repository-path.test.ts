import { describe, expect, it } from "vitest";

import { joinRepositoryPath } from "./repository-path";

describe("joinRepositoryPath", () => {
  it("allows an empty root directory", () => {
    expect(joinRepositoryPath("", "1-two-sum", "two-sum.ts")).toBe(
      "1-two-sum/two-sum.ts",
    );
  });

  it("normalizes configured nested roots", () => {
    expect(joinRepositoryPath(" solutions/", "1-two-sum")).toBe(
      "solutions/1-two-sum",
    );
  });
});
