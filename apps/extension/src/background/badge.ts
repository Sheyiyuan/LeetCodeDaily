export const RESTORE_STREAK_BADGE_ALARM = "restore-streak-badge";

const COMPLETED_BADGE_DURATION_MS = 8_000;

let restoreTimer: ReturnType<typeof setTimeout> | null = null;

export async function setStreakBadge(): Promise<void> {
  await cancelCompletedBadgeRestore();
  await chrome.action.setBadgeText({ text: "" });
}

export async function setCompletedBadge(): Promise<void> {
  await cancelCompletedBadgeRestore();
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  await chrome.action.setBadgeText({ text: "✓" });

  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    void setStreakBadge();
  }, COMPLETED_BADGE_DURATION_MS);
  await chrome.alarms.create(RESTORE_STREAK_BADGE_ALARM, {
    when: Date.now() + COMPLETED_BADGE_DURATION_MS,
  });
}

export async function setFailureBadge(): Promise<void> {
  await cancelCompletedBadgeRestore();
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  await chrome.action.setBadgeText({ text: "!" });
}

export async function clearBadge(): Promise<void> {
  await setStreakBadge();
}

async function cancelCompletedBadgeRestore(): Promise<void> {
  if (restoreTimer !== null) clearTimeout(restoreTimer);
  restoreTimer = null;
  await chrome.alarms.clear(RESTORE_STREAK_BADGE_ALARM);
}
