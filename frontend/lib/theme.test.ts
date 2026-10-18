import { describe, expect, it } from "vitest";
import { parseTheme, themeCookie, themeFromCookieHeader } from "./theme";

describe("theme", () => {
  it("accepts the three themes and treats anything else as following the system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });

  it("reads the theme out of a Cookie header among other cookies", () => {
    expect(themeFromCookieHeader("a=1; theme=dark; b=2")).toBe("dark");
    expect(themeFromCookieHeader("theme=light")).toBe("light");
    expect(themeFromCookieHeader("a=1; b=2")).toBe("system");
    expect(themeFromCookieHeader("mytheme=dark")).toBe("system");
    expect(themeFromCookieHeader("theme=%22bad%22")).toBe("system");
  });

  it("writes a cookie that lasts a year, for the whole site, and is readable by the page", () => {
    const cookie = themeCookie("dark");
    expect(cookie).toContain("theme=dark");
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("HttpOnly");
  });

  it("round-trips through the cookie", () => {
    for (const theme of ["system", "light", "dark"] as const) {
      expect(themeFromCookieHeader(themeCookie(theme).split(";")[0])).toBe(theme);
    }
  });
});
