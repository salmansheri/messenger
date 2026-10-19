import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { createVerifiedAccount } from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const headline = (page: Page) => page.getByRole("heading", { level: 1 });

/** The 3D transform of the product window, or "none". */
const tilt = (page: Page) =>
  page.getByRole("img", { name: /Messenger open on a Conversation/ }).evaluate((image) => {
    // the window is the image's ancestor that has a transform applied
    for (let element: Element | null = image; element; element = element.parentElement) {
      const transform = getComputedStyle(element).transform;
      if (transform !== "none") return transform;
    }
    return "none";
  });

test.describe("the landing page", () => {
  test("says what it is, in a headline that arrives like Messages and settles with a read receipt", async ({ page }) => {
    await page.goto("/");

    await expect(headline(page)).toHaveText(/Conversations,\s*set in type\./);
    await expect(page.getByRole("link", { name: "Create an account" }).first()).toBeVisible();
    // The whole sequence: typing, a line, typing, a line, then the dots that say it was read.
    await expect(page.getByRole("main").getByRole("link", { name: "Create an account" }).first()).toHaveCSS("opacity", "1", {
      timeout: 8_000,
    });
    await expect(page.locator("h1 time").first()).toHaveText(/^\d\d:\d\d$/, { timeout: 8_000 });
    await expect(page.locator("h1 span.text-accent")).toHaveText("••", { timeout: 8_000 });
  });

  test("leads to creating an account and to signing in, and offers the way back in to someone who is signed in", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Forgot your password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );

    await signInThroughTheForm(page, await createVerifiedAccount());
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Open Messenger" })).toHaveAttribute("href", "/app");
    await expect(page.getByRole("main").getByRole("link", { name: "Create an account" }), "no more asking to sign up").toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: "Open Messenger" }).first()).toHaveAttribute("href", "/app");
  });

  test("shows the app itself, and each part of the page has its own heading and a way to reach it", async ({ page }) => {
    await page.goto("/");
    const shot = page.getByRole("img", { name: /Messenger open on a Conversation/ });
    await expect(shot).toBeVisible();
    expect(await shot.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

    await expect(page.getByRole("heading", { level: 2, name: "Everything arrives as it happens." })).toBeAttached();
    await expect(page.getByRole("heading", { level: 2, name: "Quiet by design." })).toBeAttached();
    await expect(page.getByRole("heading", { level: 2, name: "Start a Conversation." })).toBeAttached();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const link = page.getByRole("banner").getByRole("link", { name: "Principles" });
    if (await link.isVisible()) await link.click(); // (the header's links to the sections are for wider screens)
    else await page.goto("/#principles");
    await expect(page).toHaveURL(/#principles$/);
    await expect(page.getByRole("heading", { level: 2, name: "Quiet by design." })).toBeInViewport();
  });

  test("the live demos run while they are on screen", async ({ page }) => {
    await page.goto("/#live");
    const demo = page.locator("#live");
    const presence = demo.getByText("Last seen today at 14:02");
    await presence.scrollIntoViewIfNeeded(); // a demo only runs while it is on screen
    await expect(presence).toBeVisible();
    await expect(demo.getByText("Ada is typing"), "the second demo goes on to show someone typing").toBeAttached({ timeout: 12_000 });
  });

  test("the product window is tipped back and levels out as it scrolls into place", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(headline(page)).toBeVisible();
    const before = await tilt(page);
    expect(before, "tilted back at first").toContain("matrix3d");

    await page.evaluate(() => window.scrollTo({ top: 520 }));
    await expect.poll(() => tilt(page), { message: "it levels out" }).not.toBe(before);
  });

  test("with reduced motion the headline is simply there, nothing types, and the window sits flat", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(headline(page)).toHaveText(/Conversations,\s*set in type\./);
    const lines = page.locator("h1 [data-reveal]");
    await expect(lines).toHaveCount(2);
    for (const line of await lines.all()) await expect(line).toHaveCSS("opacity", "1");
    await expect(page.locator("h1 span.text-accent"), "already read").toHaveText("••");
    await expect(page.getByRole("main").getByRole("link", { name: "Create an account" }).first()).toHaveCSS("opacity", "1");
    expect(await tilt(page)).not.toContain("matrix3d");
  });

  test("never scrolls sideways", async ({ page }) => {
    await page.goto("/");
    await expect(headline(page)).toBeVisible();
    for (const y of [0, 600, 1400, 2400, 3600]) {
      await page.evaluate((top) => window.scrollTo({ top }), y);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `at ${y}px`).toBeLessThanOrEqual(0);
    }
  });
});
