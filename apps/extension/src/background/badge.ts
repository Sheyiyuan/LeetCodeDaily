export async function setCompletedBadge(): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  await chrome.action.setBadgeText({ text: "✓" });
}

export async function setFailureBadge(): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setBadgeText({ text: "!" });
}

export async function clearBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: "" });
}
