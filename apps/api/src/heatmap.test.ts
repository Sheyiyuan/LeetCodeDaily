import { describe, expect, it } from "vitest";

import { parseHeatmapColors, renderHeatmapDocument, renderHeatmapError } from "./heatmap";

describe("parseHeatmapColors", () => {
  it("parses four URL-safe RGB colors after URL decoding", () => {
    const value = new URL(
      "https://api.test/heatmap.svg?colors=ABCDEF%2C234567%2C345678%2C456789",
    ).searchParams.get("colors");

    expect(parseHeatmapColors(value)).toEqual(["#abcdef", "#234567", "#345678", "#456789"]);
  });

  it("ignores invalid color parameters", () => {
    expect(parseHeatmapColors("red,234567,345678,456789")).toBeUndefined();
    expect(parseHeatmapColors("123456,234567")).toBeUndefined();
    expect(parseHeatmapColors(null)).toBeUndefined();
  });
});

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
    expect(svg).toContain('font-size="16">Jan</text>');
    expect(svg).not.toContain("</text>,<text");
    expect(svg).not.toContain("LeetCode Activity</text>");
    expect(svg).not.toContain(">Less</text>");
    expect(svg).not.toContain("prefers-color-scheme");
    expect(svg).not.toContain('<rect width="1360"');
    expect(
      svg.match(/<rect\b[^>]*>/g)?.every((rect) => rect.includes('class="activity-cell"')),
    ).toBe(true);
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

  it("maps distinct problem counts to all four activity color levels", () => {
    const svg = renderHeatmapDocument({
      login: "octocat",
      year: 2026,
      rows: [
        { local_date: "2026-01-01", accepted_submission_count: 1, distinct_problem_count: 1 },
        { local_date: "2026-01-02", accepted_submission_count: 2, distinct_problem_count: 2 },
        { local_date: "2026-01-03", accepted_submission_count: 3, distinct_problem_count: 3 },
        { local_date: "2026-01-04", accepted_submission_count: 5, distinct_problem_count: 5 },
      ],
      updatedAt: "2026-01-04T00:00:00.000Z",
      theme: "light",
    });

    for (const level of [1, 2, 3, 4]) {
      expect(svg.match(new RegExp(`fill="var\\(--level-${level}\\)"`, "g"))).toHaveLength(1);
    }
  });

  it("uses independent custom active colors in explicit light and dark themes", () => {
    const lightSvg = renderHeatmapDocument({
      login: "octocat",
      year: 2026,
      rows: [],
      updatedAt: null,
      theme: "light",
      colors: ["#123456", "#234567", "#345678", "#456789"],
    });
    const darkSvg = renderHeatmapDocument({
      login: "octocat",
      year: 2026,
      rows: [],
      updatedAt: null,
      theme: "dark",
      colors: ["#abcdef", "#bcdef0", "#cdef01", "#def012"],
    });

    expect(lightSvg).toContain("--level-0:#ebedf0");
    expect(lightSvg).toContain("--level-1:#123456");
    expect(lightSvg).not.toContain("#abcdef");
    expect(darkSvg).toContain("--level-0:#2d1b1b");
    expect(darkSvg).toContain("--level-1:#abcdef");
    expect(darkSvg).not.toContain("#123456");
    expect(lightSvg).not.toContain("prefers-color-scheme");
    expect(darkSvg).not.toContain("prefers-color-scheme");
  });
});

describe("renderHeatmapError", () => {
  it("returns a cache-limited SVG response", async () => {
    const response = renderHeatmapError("dark");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
    const svg = await response.text();
    expect(svg).toContain("temporarily unavailable");
    expect(svg).not.toContain('<rect width="820"');
  });
});
