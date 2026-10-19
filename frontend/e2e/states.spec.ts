import type { Page, Route } from "@playwright/test";
import { FRONTEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import { createVerifiedAccount, sendMessageVia, signIn, startDirectVia } from "./support/backend";
import { fillSignUp, newAccount, problem as notice, signInThroughTheForm, waitForForm } from "./support/auth-screens";

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

/** Answers requests (GET unless told otherwise) for the matching addresses with a problem while `refuse.on` is true, and lets everything else through. */
async function refuseWhile(page: Page, matches: (url: URL) => boolean, status: 429 | 503, retryAfter = 300, method = "GET") {
  const refuse = { on: true };
  await page.route(
    (url) => matches(url),
    (route) => (route.request().method() === method && refuse.on ? problem(route, status, retryAfter) : route.fallback()),
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
    await expectAccessible(page, "the list while rate limited");
  });

  test("signing in, signing up, starting a Conversation and creating a Group each say calmly when the server is busy or they are going too fast", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);

    // Sign in: a busy server.
    let refuse = await refuseWhile(page, (url) => url.pathname === "/api/v1/auth/login", 503, 5, "POST");
    await page.goto("/sign-in");
    await waitForForm(page);
    await page.getByRole("main").getByLabel("Email address").fill(me.email);
    await page.getByRole("main").getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
    await expect(notice(page)).toHaveText("The server is busy. Try again in a moment.");
    refuse.on = false;
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app$/);

    // Create a Group: a busy server, after a person was added.
    refuse = await refuseWhile(page, (url) => url.pathname === "/api/v1/conversations/groups", 503, 5, "POST");
    await page.goto("/app/new/group");
    await waitForForm(page);
    await page.getByLabel("Group name").fill("Analytical Engine");
    await page.getByLabel("Add a person by email").fill(grace.email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("list", { name: "People in this Group" })).toBeVisible();
    await page.getByRole("button", { name: "Create Group" }).click();
    await expect(notice(page)).toHaveText("The server is busy. Try again in a moment.");
    refuse.on = false;

    // Start a Conversation: going too fast.
    await refuseWhile(page, (url) => url.pathname === "/api/v1/users/lookup", 429, 300, "POST");
    await page.goto("/app/new");
    await waitForForm(page);
    await page.getByLabel("Their email address").fill(grace.email);
    await page.getByRole("button", { name: "Start Conversation" }).click();
    await expect(notice(page)).toHaveText("You are doing that too often. Try again in 5 minutes.");
  });

  test("signing up when too many codes were asked for says when to try again", async ({ page }) => {
    await refuseWhile(page, (url) => url.pathname === "/api/v1/auth/signup", 429, 3600, "POST");
    await page.goto("/sign-up");
    await waitForForm(page);
    await fillSignUp(page, newAccount());
    await expect(notice(page)).toHaveText("Too many codes were requested. Try again in 1 hour.");
    await expectAccessible(page, "sign-up while rate limited");
  });

  test("signing out that cannot be done says so and leaves the person signed in", async ({ page }) => {
    await signInThroughTheForm(page, await createVerifiedAccount("Me Myself"));
    await refuseWhile(page, (url) => url.pathname === "/api/v1/auth/logout", 503, 5, "POST");
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(notice(page)).toContainText("busy");
    await expectAccessible(page, "settings while signing out is refused");
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
