import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const dist = join(root, "apps/extension/dist");
const manifestPath = join(dist, "manifest.json");
const required = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

if (!existsSync(manifestPath)) throw new Error("Extension manifest is missing");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Expected Manifest V3");
for (const file of required) {
  if (!existsSync(join(dist, file))) throw new Error(`Missing extension file: ${file}`);
}

const scripts = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (/\.(?:js|html)$/.test(entry.name)) scripts.push(readFileSync(path, "utf8"));
  }
}
collect(dist);
const bundle = scripts.join("\n");
for (const forbidden of ["GITHUB_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "client_secret"]) {
  if (bundle.includes(forbidden)) throw new Error(`Secret marker found in extension: ${forbidden}`);
}
if (!manifest.host_permissions.includes("https://leetcode.cn/*")) {
  throw new Error("leetcode.cn permission is missing");
}
console.log(`Extension dist check passed (${required.length} required files)`);
