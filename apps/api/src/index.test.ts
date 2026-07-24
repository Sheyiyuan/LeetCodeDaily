import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

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
      new Request(
        "https://api.test/heatmap/github/octocat.svg?theme=dark",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    await expect(response.text()).resolves.toContain("temporarily unavailable");
  });
});
