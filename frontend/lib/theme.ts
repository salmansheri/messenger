export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

/** Anything that is not one of the three themes means "follow the system". */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? "system";
}

export function themeFromCookieHeader(cookieHeader: string): Theme {
  const found = cookieHeader.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  if (!found) return "system";
  try {
    return parseTheme(decodeURIComponent(found[1]));
  } catch {
    return "system";
  }
}

/** The cookie is readable by the page on purpose: the script below applies it before first paint. */
export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=${YEAR_IN_SECONDS}; SameSite=Lax`;
}

/**
 * Runs while the browser parses the HTML, before anything is painted. "system" leaves the attribute off so the
 * stylesheet's prefers-color-scheme rules decide. Reading the cookie here (not on the server) keeps pages static.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m&&decodeURIComponent(m[1]);var r=document.documentElement;if(t==="light"||t==="dark"){r.setAttribute("data-theme",t)}else{r.removeAttribute("data-theme")}}catch(e){}})()`;

/** Remembers the choice in the cookie and applies it to the page right now. */
export function saveTheme(theme: Theme) {
  document.cookie = themeCookie(theme);
  applyTheme(theme);
}

/** Applies a theme to the page right now. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
