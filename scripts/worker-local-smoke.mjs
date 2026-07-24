import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const apiDirectory = join(root, "apps/api");
const wrangler = join(apiDirectory, "node_modules/.bin/wrangler");
const persistDirectory = mkdtempSync(join(tmpdir(), "leetcode-daily-worker-"));
const logPath = join(persistDirectory, "wrangler.log");
const port = 8793;
const fakeKey = Buffer.alloc(32, 7).toString("base64");
const env = { ...process.env, CI: "true", WRANGLER_LOG_PATH: logPath };

function run(args) {
  const result = spawnSync(wrangler, args, {
    cwd: apiDirectory,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Wrangler failed: ${args.join(" ")}`);
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Worker did not become healthy");
}

let server;
try {
  run(["d1", "migrations", "apply", "leetcode-daily", "--local", "--persist-to", persistDirectory]);
  server = spawn(
    wrangler,
    [
      "dev",
      "--local",
      "--port",
      String(port),
      "--persist-to",
      persistDirectory,
      "--var",
      `TOKEN_ENCRYPTION_KEY:${fakeKey}`,
      "--show-interactive-dev-session",
      "false",
    ],
    { cwd: apiDirectory, env, stdio: "inherit" },
  );
  await waitForHealth();

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  if ((await health.json()).ok !== true) throw new Error("Health response is invalid");

  const missing = await fetch(`http://127.0.0.1:${port}/missing`);
  if (missing.status !== 404) throw new Error(`Expected 404, received ${missing.status}`);

  const preflight = await fetch(`http://127.0.0.1:${port}/v1/activity/days`, {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173" },
  });
  if (preflight.status !== 204) throw new Error(`Expected 204, received ${preflight.status}`);
  console.log("Worker local smoke test passed");
} finally {
  if (server) server.kill("SIGTERM");
  rmSync(persistDirectory, { recursive: true, force: true });
}
