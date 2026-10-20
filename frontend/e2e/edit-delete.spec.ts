import type { Page, Route, WebSocketRoute } from "@playwright/test";
import { FRONTEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import {
  createVerifiedAccount,
  deleteMessageVia,
  editMessageVia,
  messagesVia,
  sendMessageVia,
  signIn,
  startDirectVia,
  type Account,
} from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";
import { rowFor } from "./support/navigation";

const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const rowOf = (page: Page, text: string) => messages(page).getByRole("listitem").filter({ hasText: text });
const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();

/** Two people with a Direct conversation (Grace started it). Nobody is signed in on a page yet. */
async function twoPeople() {
  const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
  const [myToken, graceToken] = await Promise.all([signIn(me.email), signIn(grace.email)]);
  const id = await startDirectVia(graceToken, me.id);
  return { me, grace, myToken, graceToken, id };
}

/** Signs the person in on the page and opens the Conversation with the live connection up. */
async function openAs(page: Page, account: Account, id: string) {
  await signInThroughTheForm(page, account);
  await page.goto(`/app/c/${id}`);
  await live(page);
}

/** Opens a Message's actions (the "Actions" control inside its row). */
async function openActions(row: ReturnType<typeof rowOf>) {
  await row.locator("summary").click();
}

/** What the backend says when a change is refused (a closed window, a throttle, a busy server), with the CORS headers it would send. */
function refuse(route: Route, status: 409 | 429 | 503, detail?: string) {
  return route.fulfill({
    status,
    headers: {
      "content-type": "application/problem+json",
      "retry-after": "20",
      "access-control-allow-origin": FRONTEND_URL,
      "access-control-allow-credentials": "true",
      "access-control-expose-headers": "Retry-After",
    },
    body: JSON.stringify({ title: "Refused", status, detail }),
  });
}

test.describe("editing a Message", () => {
  test("edits it where it stands: Escape and an unchanged text change nothing, a saved edit shows 'edited' to both people, live and after a reload", async ({
    page,
    openSession,
  }) => {
    const { me, grace, myToken, graceToken, id } = await twoPeople();
    await sendMessageVia(myToken, id, "Helo");
    await openAs(page, me, id);
    const other = await openSession();
    await openAs(other, grace, id);
    let patches = 0;
    page.on("request", (request) => request.method() === "PATCH" && request.url().includes("/messages/") && patches++);

    await openActions(rowOf(page, "Helo"));
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Edit text" });
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue("Helo");
    await expectAccessible(page, "a Message being edited");

    await editor.fill("Something else");
    await editor.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(rowOf(page, "Helo")).toBeVisible();
    await expect(rowOf(page, "Helo").locator("summary"), "focus goes back to the Message's actions").toBeFocused();

    await openActions(rowOf(page, "Helo"));
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Edit text" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);
    expect(patches, "saving the same text asks the server for nothing").toBe(0);
    await expect(rowOf(page, "Helo").getByText("edited")).toHaveCount(0);

    await openActions(rowOf(page, "Helo"));
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Edit text" }).fill("Hello");
    await page.getByRole("textbox", { name: "Edit text" }).press("Enter");

    await expect(rowOf(page, "Hello").getByText("edited", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);
    expect(patches).toBe(1);
    await expect(rowOf(other, "Hello").getByText("edited", { exact: true }), "live for the other person").toBeVisible();
    await expect(messages(other).getByText("Helo", { exact: true })).toHaveCount(0);
    expect((await messagesVia(graceToken, id)).map((m) => m.body)).toEqual(["Hello"]);

    await other.reload();
    await expect(rowOf(other, "Hello").getByText("edited", { exact: true })).toBeVisible();
    await expect(messages(other).getByText("Hello")).toHaveCount(1);
  });

  test("closes an editor whose Message is deleted for everyone meanwhile, instead of leaving a draft stuck behind an error", async ({
    page,
  }) => {
    const { me, myToken, id } = await twoPeople();
    const message = await sendMessageVia(myToken, id, "About to vanish");
    await openAs(page, me, id);

    await openActions(rowOf(page, "About to vanish"));
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Edit text" })).toBeFocused();
    await deleteMessageVia(myToken, id, message); // from another tab or device

    await expect(messages(page).getByText("This Message was deleted.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Edit text" })).toHaveCount(0);
  });

  test("says why when the server refuses an edit and keeps what was typed, and a blank text is not sent", async ({ page }) => {
    const { me, myToken, id } = await twoPeople();
    await sendMessageVia(myToken, id, "Too old to change");
    await openAs(page, me, id);
    let answer: 409 | 503 = 409;
    await page.route(/\/conversations\/[^/]+\/messages\/[^/]+$/, (route) =>
      route.request().method() === "PATCH"
        ? refuse(route, answer, answer === 409 ? "A Message can only be edited for 15 minutes after it is sent." : undefined)
        : route.fallback(),
    );

    await openActions(rowOf(page, "Too old to change"));
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Edit text" });
    await editor.fill("   ");
    await editor.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "Write something to send." })).toBeVisible();

    await editor.fill("A better text");
    await editor.press("Enter");
    const alert = page.getByRole("main").getByRole("alert").filter({ hasText: "15 minutes" });
    await expect(alert).toHaveText("A Message can only be edited for 15 minutes after it is sent.");
    await expect(editor, "what was typed is kept").toHaveValue("A better text");
    await expectAccessible(page, "an edit the server refused");

    answer = 503;
    await editor.press("Enter");
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "busy" })).toHaveText("The server is busy. Try again in a moment.");
    await editor.press("Escape");
    await expect(rowOf(page, "Too old to change")).toBeVisible();
  });
});

test.describe("deleting a Message", () => {
  test("for everyone: it asks first, leaves a placeholder for both people, and the text is gone from the server", async ({
    page,
    openSession,
  }) => {
    const { me, grace, myToken, graceToken, id } = await twoPeople();
    await sendMessageVia(myToken, id, "Secret plans");
    await openAs(page, me, id);
    const other = await openSession();
    await openAs(other, grace, id);

    await openActions(rowOf(page, "Secret plans"));
    await page.getByRole("button", { name: "Delete for everyone" }).click();
    await expect(page.getByText("Delete this Message for everyone?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" }), "the safe choice has focus").toBeFocused();
    await expectAccessible(page, "the question before deleting for everyone");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Delete for everyone" }), "focus goes back").toBeFocused();
    await expect(rowOf(page, "Secret plans")).toBeVisible();

    await page.getByRole("button", { name: "Delete for everyone" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(messages(page).getByText("This Message was deleted.")).toBeVisible();
    await expect(messages(page).getByText("Secret plans")).toHaveCount(0);
    await expect(messages(other).getByText("This Message was deleted."), "live for the other person").toBeVisible();
    await expect(messages(other).getByText("Secret plans")).toHaveCount(0);
    const stored = await messagesVia(graceToken, id);
    expect(stored).toHaveLength(1);
    expect(stored[0].body ?? null, "the server keeps no text").toBeNull();
    expect(stored[0].deletedAt).toBeTruthy();

    const deletedRow = messages(page).getByRole("listitem").filter({ hasText: "This Message was deleted." });
    await openActions(deletedRow);
    await expect(page.getByRole("button", { name: "Edit", exact: true }), "nothing to edit in a placeholder").toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete for everyone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete for me" })).toBeVisible();
    await expectAccessible(page, "a deleted Message");

    await other.goto("/app");
    await expect(rowFor(other, id), "the list's latest line").toContainText("This Message was deleted");
    await page.goto("/app");
    await expect(rowFor(page, id)).toContainText("This Message was deleted");
  });

  test("for me: it disappears for this person only, and stays hidden after a reload", async ({ page, openSession }) => {
    const { me, grace, myToken, id } = await twoPeople();
    await sendMessageVia(myToken, id, "Keep for Grace");
    await sendMessageVia(myToken, id, "Another one");
    await openAs(page, me, id);
    const other = await openSession();
    await openAs(other, grace, id);

    await openActions(rowOf(other, "Keep for Grace"));
    await other.getByRole("button", { name: "Delete for me" }).click();
    await expect
      .poll(() => other.evaluate(() => document.activeElement?.tagName), { message: "focus stays in the history, not on the page body" })
      .not.toBe("BODY");

    await expect(messages(other).getByText("Keep for Grace")).toHaveCount(0);
    await expect(messages(other).getByText("Another one")).toBeVisible();
    await expect(messages(page).getByText("Keep for Grace"), "the sender still has it").toBeVisible();
    await other.reload();
    await expect(messages(other).getByText("Another one")).toBeVisible();
    await expect(messages(other).getByText("Keep for Grace")).toHaveCount(0);
  });

  test("says why when the server refuses a deletion, and offers to try again", async ({ page }) => {
    const { me, myToken, id } = await twoPeople();
    await sendMessageVia(myToken, id, "Cannot be deleted for everyone any more");
    await sendMessageVia(myToken, id, "Throttled");
    await openAs(page, me, id);
    let refused: 409 | 429 | undefined = 409;
    await page.route(/\/conversations\/[^/]+\/messages\/[^/]+$/, (route) =>
      route.request().method() === "DELETE" && refused
        ? refuse(route, refused, refused === 409 ? "A Message can only be deleted for everyone for 60 minutes after it is sent." : undefined)
        : route.fallback(),
    );

    const row = rowOf(page, "Cannot be deleted for everyone any more");
    await openActions(row);
    await page.getByRole("button", { name: "Delete for everyone" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "60 minutes" })).toHaveText(
      "A Message can only be deleted for everyone for 60 minutes after it is sent.",
    );
    await expect(row.getByText("Cannot be deleted for everyone any more")).toBeVisible();

    refused = 429;
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "too often" })).toHaveText(
      "You are changing Messages too often. Try again in 20 seconds.",
    );
    await expectAccessible(page, "a deletion that was throttled");

    refused = undefined;
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(messages(page).getByText("This Message was deleted.")).toBeVisible();
  });
});

test.describe("seeing other people's changes", () => {
  /** Routes the page's socket through the test so it can be refused and dropped. */
  async function controlSocket(page: Page) {
    const state = { refuse: false, current: undefined as WebSocketRoute | undefined };
    await page.routeWebSocket(/\/ws$/, (ws) => {
      if (state.refuse) {
        void ws.close();
        return;
      }
      const server = ws.connectToServer();
      state.current = ws;
      ws.onMessage((message) => server.send(message));
    });
    return state;
  }

  test("after the connection was lost, edits and deletions made meanwhile are shown once it is back", async ({ page }) => {
    const { me, graceToken, id } = await twoPeople();
    const edited = await sendMessageVia(graceToken, id, "Original words");
    const deleted = await sendMessageVia(graceToken, id, "To be withdrawn");
    const sockets = await controlSocket(page);
    await openAs(page, me, id);
    await expect(messages(page).getByText("Original words")).toBeVisible();

    sockets.refuse = true;
    await sockets.current!.close();
    await expect(page.locator('[data-connection="reconnecting"]')).toBeAttached();
    await editMessageVia(graceToken, id, edited, "Corrected words");
    await deleteMessageVia(graceToken, id, deleted);
    await expect(messages(page).getByText("Original words"), "nothing arrives while the connection is down").toBeVisible();

    sockets.refuse = false;
    await expect(messages(page).getByText("Corrected words")).toBeVisible({ timeout: 30_000 });
    await expect(rowOf(page, "Corrected words").getByText("edited", { exact: true })).toBeVisible();
    await expect(messages(page).getByText("This Message was deleted.")).toBeVisible();
    await expect(messages(page).getByText("To be withdrawn")).toHaveCount(0);
    await expect(messages(page).getByText("Original words")).toHaveCount(0);
  });

  test("an edit or a deletion by someone else is announced to a screen reader", async ({ page }) => {
    const { me, graceToken, id } = await twoPeople();
    const first = await sendMessageVia(graceToken, id, "Meet at nine");
    const second = await sendMessageVia(graceToken, id, "Bring snacks");
    await openAs(page, me, id);
    const log = page.getByRole("log", { name: "New Messages" });
    await expect(messages(page).getByText("Bring snacks")).toBeVisible();

    await editMessageVia(graceToken, id, first, "Meet at ten");
    await expect(log).toContainText("Grace Hopper edited a Message: Meet at ten");
    await deleteMessageVia(graceToken, id, second);
    await expect(log).toContainText("Grace Hopper deleted a Message");
  });
});

test.describe("from the keyboard", () => {
  test("a Message can be edited with the keyboard alone", async ({ page }) => {
    const { me, myToken, id } = await twoPeople();
    await sendMessageVia(myToken, id, "Typo here");
    await openAs(page, me, id);

    await rowOf(page, "Typo here").locator("summary").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab"); // Edit
    await page.keyboard.press("Enter");
    const editor = page.getByRole("textbox", { name: "Edit text" });
    await expect(editor).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Fixed here");
    await page.keyboard.press("Enter");

    await expect(rowOf(page, "Fixed here").getByText("edited", { exact: true })).toBeVisible();
    await expect(rowOf(page, "Fixed here").locator("summary")).toBeFocused();
  });
});
