import { describe, expect, it } from "vitest";

import { chunkActivityDays } from "./activity-sync";

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
});
