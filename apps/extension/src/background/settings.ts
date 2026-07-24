import type { ExtensionSettings } from "../shared/messages";

const DEFAULTS = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  githubRepository: null,
  githubBranch: "main",
  githubRootDirectory: "solutions",
  heatmapPublicEnabled: false,
} satisfies ExtensionSettings;

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return {
    timezone:
      typeof stored.timezone === "string" ? stored.timezone : DEFAULTS.timezone,
    githubRepository:
      typeof stored.githubRepository === "string"
        ? stored.githubRepository
        : null,
    githubBranch:
      typeof stored.githubBranch === "string"
        ? stored.githubBranch
        : DEFAULTS.githubBranch,
    githubRootDirectory:
      typeof stored.githubRootDirectory === "string"
        ? stored.githubRootDirectory
        : DEFAULTS.githubRootDirectory,
    heatmapPublicEnabled:
      typeof stored.heatmapPublicEnabled === "boolean"
        ? stored.heatmapPublicEnabled
        : DEFAULTS.heatmapPublicEnabled,
  };
}

export async function writeSettings(
  settings: ExtensionSettings,
): Promise<void> {
  new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone }).format();
  await chrome.storage.local.set(settings);
}
