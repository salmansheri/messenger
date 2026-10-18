import { expect, test } from "@playwright/test";

const LIGHT_PAPER = "rgb(250, 246, 239)";
const DARK_PAPER = "rgb(20, 19, 15)";

const paper = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("theme", () => {
  test("follows the system by default, in both directions", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await paper(page)).toBe(DARK_PAPER);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);

    await page.emulateMedia({ colorScheme: "light" });
    expect(await paper(page)).toBe(LIGHT_PAPER);
  });

  test("a manual choice beats the system and survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(await paper(page)).toBe(DARK_PAPER);

    await page.reload();
    expect(await paper(page)).toBe(DARK_PAPER);
    await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Light" }).click();
    expect(await paper(page)).toBe(LIGHT_PAPER);
  });

  test("choosing System goes back to following the system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Light" }).click();
    expect(await paper(page)).toBe(LIGHT_PAPER);

    await page.getByRole("button", { name: "System" }).click();

    expect(await paper(page)).toBe(DARK_PAPER);
    await page.reload();
    expect(await paper(page)).toBe(DARK_PAPER);
  });

  test("the saved theme is already applied before the app's own JavaScript runs, so there is no flash", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.route(/\/_next\/.*\.js/, (route) => route.abort()); // React never loads: only the inline script ran

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await paper(page)).toBe(DARK_PAPER);
  });

  test("text stays readable in both themes", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      const ratio = await page.evaluate(() => {
        const luminance = (css: string) => {
          const [r, g, b] = css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => {
            const c = Number(v) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const styles = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        const bg = luminance(getComputedStyle(document.body).backgroundColor);
        const pairs = ["h1", "p"].map((selector) => luminance(styles(selector).color));
        return Math.min(...pairs.map((l) => (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05)));
      });
      expect(ratio, `contrast in ${scheme}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
