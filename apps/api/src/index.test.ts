import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function publicHeatmapEnv() {
  return {
    DB: {
      prepare(query: string) {
        return {
          bind() {
            if (query.includes("FROM github_login_aliases")) {
              return {
                first: async () => ({
                  github_user_id: 1,
                  current_login: "octocat",
                  public_enabled: 1,
                  timezone: "UTC",
                  updated_at: "2026-09-05T00:00:00.000Z",
                }),
              };
            }
            if (query.includes("FROM daily_activity")) {
              return { all: async () => ({ results: [] }) };
            }
            throw new Error(`Unexpected query: ${query}`);
          },
        };
      },
    },
  } as never;
}

describe("Worker routing", () => {
  it("serves the health endpoint and emits a query-free structured log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://api.test/health?token=must-not-appear"),
      {} as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "leetcode-daily-api",
    });
    const entry = String(log.mock.calls[0]?.[0]);
    expect(entry).toContain('"route":"/health"');
    expect(entry).not.toContain("must-not-appear");
  });

  it("turns heatmap storage failures into a displayable SVG", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = {
      DB: {
        prepare() {
          throw new Error("database unavailable");
        },
      },
    } as never;
    const response = await worker.fetch(
      new Request("https://api.test/heatmap/github/octocat.svg?theme=dark"),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    await expect(response.text()).resolves.toContain("temporarily unavailable");
  });

  it("renders URL-configured colors for a fixed year and ignores cache version parameters", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request(
        "https://api.test/heatmap/github/octocat.svg?year=2026&theme=dark&colors=0e4429%2C006d32%2C26a641%2C39d353&v=2",
      ),
      publicHeatmapEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    const svg = await response.text();
    expect(svg).toContain("octocat LeetCode activity for 2026");
    expect(svg).toContain("--level-0:#2d1b1b");
    expect(svg).toContain("--level-1:#0e4429");
    expect(svg).toContain("--level-4:#39d353");
    expect(svg).not.toContain("prefers-color-scheme");
  });

  it("uses a rolling 365-day window when year is omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://api.test/heatmap/github/octocat.svg"),
      publicHeatmapEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      "octocat LeetCode activity for 2025-09-06 to 2026-09-05",
    );
  });

  it("falls back to the default palette when colors are invalid", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://api.test/heatmap/github/octocat.svg?year=2026&colors=red"),
      publicHeatmapEnv(),
    );

    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("--level-1:#ffd8bf");
    expect(svg).not.toContain("--level-1:red");
  });
});
