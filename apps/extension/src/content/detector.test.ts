import { describe, expect, it } from "vitest";

import {
  isAcceptedResultText,
  isFreshAcceptedResultText,
  submissionIdFromUrl,
  titleSlugFromPathname,
} from "./detector";

describe("LeetCode submission detector", () => {
  it("extracts a title slug from problem and submission pages", () => {
    expect(titleSlugFromPathname("/problems/two-sum/")).toBe("two-sum");
    expect(titleSlugFromPathname("/problems/two-sum/submissions/737806932/")).toBe("two-sum");
  });

  it("extracts current and legacy submission IDs", () => {
    expect(
      submissionIdFromUrl(
        "https://leetcode.cn/problems/two-sum/submissions/737806932/?envType=study-plan-v2",
      ),
    ).toBe("737806932");
    expect(submissionIdFromUrl("/submissions/detail/123456789/")).toBe("123456789");
  });

  it("only accepts standalone successful result text", () => {
    expect(isAcceptedResultText("通过")).toBe(true);
    expect(isAcceptedResultText(" Accepted\n")).toBe(true);
    expect(isAcceptedResultText("通过率")).toBe(false);
    expect(isAcceptedResultText("9 通过 17 分钟前")).toBe(false);
    expect(isAcceptedResultText("Wrong Answer")).toBe(false);
  });

  it("does not treat an existing Accepted badge as a new result", () => {
    expect(isFreshAcceptedResultText("通过", "通过")).toBe(false);
    expect(isFreshAcceptedResultText("Accepted", "Accepted")).toBe(false);
    expect(isFreshAcceptedResultText("通过", "Wrong Answer")).toBe(true);
    expect(isFreshAcceptedResultText("Accepted", "")).toBe(true);
    expect(isFreshAcceptedResultText("通过", undefined)).toBe(true);
  });
});
