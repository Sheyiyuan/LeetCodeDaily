import { useEffect, useState } from "react";

export type UiTheme = "dark" | "light";

function applyTheme(theme: UiTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function useTheme(): [UiTheme, () => void] {
  const [theme, setTheme] = useState<UiTheme>("dark");

  useEffect(() => {
    void chrome.storage.local.get("uiTheme").then((stored) => {
      const saved = stored.uiTheme;
      const next: UiTheme =
        saved === "dark" || saved === "light"
          ? saved
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
      setTheme(next);
      applyTheme(next);
    });
  }, []);

  function toggle(): void {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    void chrome.storage.local.set({ uiTheme: next });
  }

  return [theme, toggle];
}
