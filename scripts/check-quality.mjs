import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

const mode = process.argv[2];
if (mode !== "format" && mode !== "lint") {
  throw new Error("Usage: node scripts/check-quality.mjs <format|lint>");
}

const tracked = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"], {
  encoding: "utf8",
});
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
  encoding: "utf8",
});
const supported = /\.(?:css|html|js|jsx|json|mjs|svg|ts|tsx)$/;
const files = [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/))].filter(
  (file) =>
    file && supported.test(file) && !file.includes("/dist/") && !file.includes("/.wrangler/"),
);

if (files.length === 0) process.exit(0);

const result = spawnSync(
  "./node_modules/.bin/biome",
  [mode, "--error-on-warnings", "--no-errors-on-unmatched", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
