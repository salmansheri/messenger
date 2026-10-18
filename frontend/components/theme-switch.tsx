"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { applyTheme, saveTheme, themeFromCookieHeader, type Theme, THEMES } from "@/lib/theme";

const LABELS: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };
const THEME_CHANGED_EVENT = "theme-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGED_EVENT, onChange);
}

const savedTheme = () => themeFromCookieHeader(document.cookie);
const themeOnServer = (): Theme => "system";

/** System / light / dark, remembered in a cookie that the inline script in the layout applies before first paint. */
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribe, savedTheme, themeOnServer);

  // React's development remount resets attributes on <html>; this puts the saved theme back (a no-op in production).
  useLayoutEffect(() => applyTheme(savedTheme()), []);

  function choose(next: Theme) {
    saveTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
  }

  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-full border border-rule p-0.5">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          onClick={() => choose(option)}
          className="rounded-full px-3 py-1 text-sm text-ink-muted transition-colors hover:text-ink aria-pressed:bg-ink aria-pressed:text-paper"
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
