import { describe, expect, it } from "vitest";

import { calculateCurrentStreak } from "./streak";

describe("calculateCurrentStreak", () => {
  it("counts consecutive active days ending today", () => {
    expect(
      calculateCurrentStreak(
        [
          { localDate: "2026-07-23", acceptedSubmissionCount: 1 },
          { localDate: "2026-07-24", acceptedSubmissionCount: 2 },
          { localDate: "2026-07-25", acceptedSubmissionCount: 1 },
        ],
        "2026-07-25",
      ),
    ).toBe(3);
  });

  it("returns zero when today has no accepted submission", () => {
    expect(
      calculateCurrentStreak(
        [{ localDate: "2026-07-24", acceptedSubmissionCount: 1 }],
        "2026-07-25",
      ),
    ).toBe(0);
  });

  it("stops at the first inactive day", () => {
    expect(
      calculateCurrentStreak(
        [
          { localDate: "2026-07-21", acceptedSubmissionCount: 1 },
          { localDate: "2026-07-23", acceptedSubmissionCount: 1 },
          { localDate: "2026-07-24", acceptedSubmissionCount: 0 },
          { localDate: "2026-07-25", acceptedSubmissionCount: 1 },
        ],
        "2026-07-25",
      ),
    ).toBe(1);
  });
});
