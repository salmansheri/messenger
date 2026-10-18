import { expect, test } from "./support/fixtures";
import type { Page } from "@playwright/test";

/** Reads the page's resolved colours as 0-255 triples, so tests state intent (dark or light) not hex values. */
type Rgb = [number, number, number];
const parse = (css: string): Rgb => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number) as Rgb;
const luminance = ([r, g, b]: Rgb) => {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const bodyBackground = async (page: Page) =>
  parse(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
const isDark = async (page: Page) => luminance(await bodyBackground(page)) < 0.1;
const isLight = async (page: Page) => luminance(await bodyBackground(page)) > 0.7;

/** The colour a CSS token resolves to right now. */
const token = async (page: Page, name: string) =>
  parse(
    await page.evaluate((variable) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${variable})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }, name),
  );

const colourOf = async (page: Page, selector: string, property: "color" | "backgroundColor") =>
  parse(await page.locator(selector).first().evaluate((el, prop) => getComputedStyle(el)[prop as "color"], property));

test.describe("theme", () => {
  test("follows the system by default, in both directions", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await isDark(page)).toBe(true);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);

    await page.emulateMedia({ colorScheme: "light" });
    expect(await isLight(page)).toBe(true);
  });

  test("a manual choice beats the system and survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(await isDark(page)).toBe(true);

    await page.reload();
    expect(await isDark(page)).toBe(true);
    await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Light" }).click();
    expect(await isLight(page)).toBe(true);
  });

  test("choosing System goes back to following the system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Light" }).click();
    expect(await isLight(page)).toBe(true);

    await page.getByRole("button", { name: "System" }).click();

    expect(await isDark(page)).toBe(true);
    await page.reload();
    expect(await isDark(page)).toBe(true);
  });

  test("the saved theme is in place at the very first paint, before the app's own JavaScript runs", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => {
      new PerformanceObserver((list) => {
        if (list.getEntries().some((entry) => entry.name === "first-contentful-paint")) {
          (window as unknown as { backgroundAtFirstPaint: string }).backgroundAtFirstPaint = getComputedStyle(
            document.body,
          ).backgroundColor;
        }
      }).observe({ type: "paint", buffered: true });
    });
    await page.route(/\/_next\/.*\.js/, (route) => route.abort()); // React never loads: only the inline script ran

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForFunction(() => "backgroundAtFirstPaint" in window);
    const atFirstPaint = parse(
      await page.evaluate(() => (window as unknown as { backgroundAtFirstPaint: string }).backgroundAtFirstPaint),
    );
    expect(luminance(atFirstPaint), "background when the first content was painted").toBeLessThan(0.1);
  });

  test("two people in two browser contexts keep their own theme", async ({ page, openSession }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Dark" }).click();
    expect(await isDark(page)).toBe(true);

    const other = await openSession();
    await other.emulateMedia({ colorScheme: "light" });
    await other.goto("/");

    expect(await isLight(other)).toBe(true);
  });

  test("every text and control pairing on the page is readable in both themes", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await page.getByRole("button", { name: "System" }).click(); // the "pressed" state is on screen too
      const paper = await token(page, "--paper");

      const text = {
        "heading on paper": [await colourOf(page, "h1", "color"), paper],
        "muted text on paper": [await colourOf(page, "section p", "color"), paper],
        "muted preview on paper": [await colourOf(page, "nav li p", "color"), paper],
        "monospace time on paper": [await colourOf(page, "nav li span.font-mono", "color"), paper],
        "text on the accent badge": [
          await colourOf(page, "nav span.bg-accent", "color"),
          await colourOf(page, "nav span.bg-accent", "backgroundColor"),
        ],
        "text on the highlighted own line": [
          await colourOf(page, "li.bg-band p", "color"),
          await colourOf(page, "li.bg-band", "backgroundColor"),
        ],
        "pressed theme button": [
          await colourOf(page, "button[aria-pressed=true]", "color"),
          await colourOf(page, "button[aria-pressed=true]", "backgroundColor"),
        ],
      } satisfies Record<string, [Rgb, Rgb]>;
      for (const [name, [foreground, background]] of Object.entries(text)) {
        expect(contrast(foreground, background), `${name} in ${scheme}`).toBeGreaterThanOrEqual(4.5);
      }

      const accent = await token(page, "--accent");
      expect(contrast(accent, paper), `focus ring against paper in ${scheme}`).toBeGreaterThanOrEqual(3);
      expect(contrast(await token(page, "--rule"), paper), `rules are visible in ${scheme}`).toBeGreaterThanOrEqual(1.2);
    }
  });
});
