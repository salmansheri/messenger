import { expect, test } from "./support/fixtures";

test.describe("layout", () => {
  test("the index and the reading column sit side by side on a desktop and stack on a phone", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    const index = await page.getByRole("navigation", { name: "Conversations" }).boundingBox();
    const reading = await page.getByRole("region", { name: "A conversation" }).boundingBox();
    expect(index && reading).toBeTruthy();

    if (testInfo.project.name.startsWith("desktop")) {
      expect(reading!.x).toBeGreaterThanOrEqual(index!.x + index!.width - 1);
      expect(Math.abs(reading!.y - index!.y)).toBeLessThan(80);
    } else {
      expect(reading!.y).toBeGreaterThanOrEqual(index!.y + index!.height - 1);
    }
  });

  test("the page never scrolls sideways", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
