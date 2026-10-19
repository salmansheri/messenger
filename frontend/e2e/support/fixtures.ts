import { test as base, type Page } from "@playwright/test";

/**
 * `openSession()` opens a page in a brand-new browser context (its own cookies and storage, the same device settings
 * as the test's project), so one test can play several people at once. Contexts are closed when the test ends.
 */
export const test = base.extend<{ openSession: () => Promise<Page> }>({
  openSession: async ({ browser, baseURL, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, colorScheme }, provide) => {
    const opened: { close: () => Promise<void> }[] = [];
    await provide(async () => {
      const context = await browser.newContext({ baseURL, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, colorScheme });
      opened.push(context);
      return context.newPage();
    });
    await Promise.all(opened.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
