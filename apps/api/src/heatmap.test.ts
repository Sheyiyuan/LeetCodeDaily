import { describe, expect, it } from "vitest";

import { renderHeatmapDocument, renderHeatmapError } from "./heatmap";

describe("renderHeatmapDocument", () => {
  it("renders accepted totals, escaped account names, and one cell per day", () => {
    const svg = renderHeatmapDocument({
      login: "test<user",
      year: 2024,
      rows: [
        {
          local_date: "2024-01-01",
          accepted_submission_count: 3,
          distinct_problem_count: 2,
        },
      ],
      updatedAt: "2024-07-24T00:00:00.000Z",
      theme: "light",
    });

    expect(svg).toContain("test&lt;user");
    expect(svg).toContain("3 accepted");
    expect(svg.match(/class="activity-cell"/g)).toHaveLength(371);
    expect(svg).toContain('width="1360" height="196" viewBox="0 0 1360 196"');
    expect(svg).toContain(">Jan</text>");
    expect(svg).toContain(">Mon</text>");
    expect(svg).not.toContain("LeetCode Activity</text>");
    expect(svg).not.toContain(">Less</text>");
    expect(svg).not.toContain("prefers-color-scheme");
  });

  it("renders an explicit empty state and an adaptive theme", () => {
    const svg = renderHeatmapDocument({
      login: "octocat",
      year: 2026,
      rows: [],
      updatedAt: null,
      theme: "auto",
    });

    expect(svg).toContain("No activity yet");
    expect(svg).toContain("prefers-color-scheme:dark");
    expect(svg).toContain("Updated not synced");
  });

  it("supports a rolling window ending at the latest activity date", () => {
    const svg = renderHeatmapDocument({
      login: "octocat",
      year: 2026,
      endDate: "2026-07-25",
      rows: [
        {
          local_date: "2026-07-25",
          accepted_submission_count: 1,
          distinct_problem_count: 1,
        },
      ],
      updatedAt: "2026-07-25T00:00:00.000Z",
      theme: "light",
    });

    expect(svg).toContain("2025-07-26 to 2026-07-25");
    expect(svg).toContain('fill="var(--level-1)" opacity="1"');
  });
});

describe("renderHeatmapError", () => {
  it("returns a cache-limited SVG response", async () => {
    const response = renderHeatmapError("dark");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
    await expect(response.text()).resolves.toContain("temporarily unavailable");
  });
});
