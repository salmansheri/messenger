import type { Page, Route } from "@playwright/test";
import { FRONTEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import { createVerifiedAccount, sendMessageVia, signIn, startDirectVia } from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

/** What the backend says when it is busy (503) or when someone is going too fast (429 with how long to wait). */
function problem(route: Route, status: 429 | 503, retryAfter: number) {
  return route.fulfill({
    status,
    headers: {
      "content-type": "application/problem+json",
      "retry-after": String(retryAfter),
      "access-control-allow-origin": FRONTEND_URL,
      "access-control-allow-credentials": "true",
      "access-control-expose-headers": "Retry-After",
    },
    body: JSON.stringify({ title: status === 429 ? "Too Many Requests" : "Service Unavailable", status }),
  });
}

/** Answers GET requests for `path` with a problem while `refuse.on` is true, and lets everything else through. */
async function refuseWhile(page: Page, matches: (url: URL) => boolean, status: 429 | 503, retryAfter = 300) {
  const refuse = { on: true };
  await page.route(
    (url) => matches(url),
    (route) => (route.request().method() === "GET" && refuse.on ? problem(route, status, retryAfter) : route.fallback()),
  );
  return refuse;
}

const isList = (url: URL) => url.pathname === "/api/v1/conversations";

test.describe("calm states", () => {
  test("a busy server (503) on the list says so once, offers to try again, and recovers", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    await startDirectVia(await signIn(grace.email), me.id);
    const refuse = await refuseWhile(page, isList, 503);
    await signInThroughTheForm(page, me);

    const nav = page.getByRole("navigation", { name: "Conversations" });
    await expect(nav.getByRole("alert")).toHaveText("The server is busy. Try again in a moment.");
    await expect(nav.getByText("Grace Hopper")).toHaveCount(0);
    await expectAccessible(page, "the list while the server is busy");

    refuse.on = false;
    await nav.getByRole("button", { name: "Try again" }).click();
    await expect(nav.getByText("Grace Hopper")).toBeVisible();
    await expect(nav.getByRole("alert")).toHaveCount(0);
  });

  test("being rate limited (429) says how long to wait", async ({ page }) => {
    const me = await createVerifiedAccount("Me Myself");
    await refuseWhile(page, isList, 429, 300);
    await signInThroughTheForm(page, me);

    await expect(page.getByRole("navigation", { name: "Conversations" }).getByRole("alert")).toHaveText(
      "You are doing that too often. Try again in 5 minutes.",
    );
  });

  test("a Conversation whose Messages cannot be loaded says so, keeps the header, and can try again", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, id, "Still here");
    await signInThroughTheForm(page, me);
    const refuse = await refuseWhile(page, (url) => url.pathname === `/api/v1/conversations/${id}/messages`, 503);

    await page.goto(`/app/c/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("The server is busy. Try again in a moment.");
    await expect(page.getByRole("textbox", { name: "Message" }), "nothing to write in until it loads").toHaveCount(0);
    await expectAccessible(page, "a Conversation while the server is busy");

    refuse.on = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("list", { name: "Messages" }).getByText("Still here")).toBeVisible();
  });

  test("an open Conversation whose list cannot be loaded offers to try again too", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    const refuse = await refuseWhile(page, isList, 503);

    await page.goto(`/app/c/${id}`);
    await expect(page.getByRole("main").getByRole("alert").first()).toHaveText("The server is busy. Try again in a moment.");
    refuse.on = false;
    await page.getByRole("main").getByRole("button", { name: "Try again" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });

  test("settings that cannot load their details say so calmly", async ({ page }) => {
    const me = await createVerifiedAccount("Me Myself");
    await signInThroughTheForm(page, me);
    await refuseWhile(page, (url) => url.pathname === "/api/v1/users/me", 503);

    await page.goto("/app/settings");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("The server is busy. Try again in a moment.");
  });

  test("waiting is announced: the list says it is loading while it loads", async ({ page }) => {
    const me = await createVerifiedAccount("Me Myself");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => isList(url),
      async (route) => {
        await gate;
        await route.fallback();
      },
    );
    await signInThroughTheForm(page, me).catch(() => undefined); // the sign-in page waits for /app, which waits for the list

    await expect(page.getByRole("status").filter({ hasText: "Loading your Conversations…" })).toBeVisible();
    release();
    await expect(page.getByText("You have no Conversations yet.")).toBeVisible();
  });
});
