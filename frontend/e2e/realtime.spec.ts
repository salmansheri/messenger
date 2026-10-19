import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  createGroupVia,
  createVerifiedAccount,
  removeParticipantVia,
  renameGroupVia,
  sendMessageVia,
  signIn,
  startDirectVia,
} from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const index = (page: Page) => page.getByRole("navigation", { name: "Conversations" });
const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const rowFor = (page: Page, id: string) => index(page).locator(`a[href="/app/c/${id}"]`);

/** Waits until the live connection is up and listening (the header note stays empty while it is). */
const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();

test.describe("live updates", () => {
  test("a Message sent from a second browser appears at once in the open Conversation, and in the list", async ({
    page,
    openSession,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);

    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await composer(theirs).fill("Written in the other browser");
    await composer(theirs).press("Enter");

    await expect(messages(page).getByText("Written in the other browser")).toBeVisible();
    await expect(messages(page).getByText("Grace Hopper", { exact: true })).toBeVisible();
  });

  test("the list moves a Conversation to the top with its new latest line and an unread mark, without a reload", async ({
    page,
  }) => {
    const [me, grace, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const [graceToken, linusToken] = await Promise.all([signIn(grace.email), signIn(linus.email)]);
    const withGrace = await startDirectVia(graceToken, me.id);
    const withLinus = await startDirectVia(linusToken, me.id);
    await sendMessageVia(graceToken, withGrace, "Older");
    await sendMessageVia(linusToken, withLinus, "Newer");
    await signInThroughTheForm(page, me);
    await live(page);
    const items = index(page).getByRole("listitem");
    await expect(items.nth(0)).toContainText("Linus Torvalds");

    await sendMessageVia(graceToken, withGrace, "Now this one");

    await expect(items.nth(0)).toContainText("Grace Hopper");
    await expect(items.nth(0)).toContainText("Now this one");
    await expect(items.nth(0)).toContainText("2 unread Messages");
    await expect(items.nth(1)).toContainText("Linus Torvalds");
  });

  test("a Conversation I did not know about appears in the list when someone starts it", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    await signInThroughTheForm(page, me);
    await live(page);
    await expect(page.getByText("You have no Conversations yet.")).toBeVisible();

    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, id, "Hello, new here");

    await expect(rowFor(page, id)).toContainText("Hello, new here");
    await expect(page.getByText("You have no Conversations yet.")).toHaveCount(0);
  });

  test("a renamed Group changes its name in the list at once, and being removed takes it away and tells the open view", async ({
    page,
  }) => {
    const [me, ada] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Ada Lovelace")]);
    const adaToken = await signIn(ada.email);
    const group = await createGroupVia(adaToken, "Analytical Engine", [me.id]);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${group}`);
    await live(page);
    await expect(page.getByRole("heading", { level: 1, name: "Analytical Engine" })).toBeVisible();

    await renameGroupVia(adaToken, group, "Difference Engine");
    await expect(page.getByRole("heading", { level: 1, name: "Difference Engine" })).toBeVisible();

    await removeParticipantVia(adaToken, group, me.id);
    await expect(page.getByText("You are no longer part of this Conversation.")).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
    await expect(page.getByText("This Conversation was not found.")).toHaveCount(0);
    await page.getByRole("link", { name: "Back to your Conversations" }).click();
    await expect(page.getByText("You have no Conversations yet.")).toBeVisible();
  });
});

test.describe("a Message whose answer was lost", () => {
  test("shows as sent once it arrives live, without anyone pressing Retry, and is not doubled", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    await page.route(`**/conversations/${id}/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fetch(); // the server stores it, but the answer never makes it back
      return route.abort("connectionreset");
    });

    await composer(page).fill("Answer got lost");
    await composer(page).press("Enter");

    await expect(messages(page).getByText("Answer got lost")).toHaveCount(1);
    await expect(messages(page).getByText("Not sent.")).toHaveCount(0);
    await expect(messages(page).getByText("Sending…")).toHaveCount(0);
  });
});

test.describe("the connection", () => {
  /** Routes the page's sockets through the test: they can be dropped, refused, and the CONNECT frames read. */
  async function controlSockets(page: Page) {
    const state = { refuse: false, current: undefined as WebSocketRoute | undefined, tokens: [] as string[] };
    await page.routeWebSocket(/\/ws$/, (ws) => {
      if (state.refuse) {
        void ws.close();
        return;
      }
      const server = ws.connectToServer();
      state.current = ws;
      ws.onMessage((message) => {
        const frame = String(message);
        if (frame.startsWith("CONNECT")) state.tokens.push(frame.match(/Authorization:Bearer (.+)/)?.[1] ?? "");
        server.send(message);
      });
    });
    return state;
  }

  test("shows that it is reconnecting while the network is gone, then catches up on what was missed", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, id, "Before the drop");
    const sockets = await controlSockets(page);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    await expect(messages(page).getByText("Before the drop")).toBeVisible();

    sockets.refuse = true;
    await sockets.current!.close();
    await expect(page.locator('[data-connection="reconnecting"]')).toBeAttached();
    await expect(page.getByRole("status").filter({ hasText: "Reconnecting…" })).toBeVisible();
    await sendMessageVia(graceToken, id, "Missed one");
    await sendMessageVia(graceToken, id, "Missed two");
    await expect(messages(page).getByText("Missed one")).toHaveCount(0);

    const catchUp = page.waitForRequest((request) => request.url().includes(`/conversations/${id}/messages?`) && request.url().includes("afterSeq="), { timeout: 30_000 });
    sockets.refuse = false;

    await expect(messages(page).getByText("Missed one")).toBeVisible({ timeout: 30_000 });
    await expect(messages(page).getByText("Missed two")).toBeVisible();
    await catchUp;
    await expect(page.locator('[data-connection="connected"]')).toBeAttached();
    await expect(page.getByRole("status").filter({ hasText: "Reconnecting…" })).toHaveCount(0);
    await expect(messages(page).getByText("Missed one")).toHaveCount(1);

    await sendMessageVia(graceToken, id, "Live again");
    await expect(messages(page).getByText("Live again")).toBeVisible();
  });

  test("opens the socket again after the server closes it, and with a fresh token after the session renews", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    const sockets = await controlSockets(page);
    await page.clock.install();
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const opened = sockets.tokens.length;

    // The server closes it: the page opens another.
    await sockets.current!.close();
    await expect.poll(() => sockets.tokens.length, { timeout: 20_000 }).toBe(opened + 1);
    await live(page);

    // The session renews (fourteen minutes on); the socket is opened again with the new token.
    const tokensBefore = new Set(sockets.tokens).size;
    await page.clock.fastForward("14:30");
    await expect
      .poll(() => new Set(sockets.tokens).size, { message: "a new access token was presented", timeout: 30_000 })
      .toBeGreaterThan(tokensBefore);
    await live(page);

    await sendMessageVia(graceToken, id, "After the renewal");
    await expect(messages(page).getByText("After the renewal")).toBeVisible();
  });
});
