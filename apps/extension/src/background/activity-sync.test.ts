import { describe, expect, it } from "vitest";

import {
  chunkActivityDays,
  createActivitySnapshotPayloads,
} from "./activity-sync";

describe("chunkActivityDays", () => {
  it("keeps an empty batch so the server can initialize heatmap settings", () => {
    expect(chunkActivityDays([])).toEqual([[]]);
  });

  it("splits long histories into payloads accepted by the API", () => {
    const days = Array.from({ length: 801 }, (_, index) => index);

    const chunks = chunkActivityDays(days);

    expect(chunks.map((chunk) => chunk.length)).toEqual([400, 400, 1]);
    expect(chunks.flat()).toEqual(days);
  });

  it("numbers every batch in one replaceable snapshot", () => {
    const days = Array.from({ length: 401 }, (_, index) => ({
      localDate: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      acceptedSubmissionCount: 1,
      distinctProblemCount: 1,
    }));

    const payloads = createActivitySnapshotPayloads(
      days,
      "Asia/Shanghai",
      "00000000-0000-4000-8000-000000000001",
    );

    expect(payloads).toHaveLength(2);
    expect(payloads.map(({ batchIndex, batchCount }) => ({
      batchIndex,
      batchCount,
    }))).toEqual([
      { batchIndex: 0, batchCount: 2 },
      { batchIndex: 1, batchCount: 2 },
    ]);
    expect(
      payloads.every((payload) => payload.syncId === payloads[0]?.syncId),
    ).toBe(true);
  });
});
