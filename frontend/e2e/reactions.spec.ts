import type { Page, Route, WebSocketRoute } from "@playwright/test";
import { FRONTEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import {
  createGroupVia,
  createVerifiedAccount,
  deleteMessageVia,
  reactVia,
  removeParticipantVia,
  sendMessageVia,
  signIn,
  startDirectVia,
  unreactVia,
  type Account,
} from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const THUMBS_UP = "👍";
const HEART = "❤️";

const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const rowOf = (page: Page, text: string) => messages(page).getByRole("listitem").filter({ hasText: text });
const reactButton = (row: ReturnType<typeof rowOf>) => row.getByRole("button", { name: /^React to / });
const chip = (row: ReturnType<typeof rowOf>, name: string) => row.getByRole("button", { name });
const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();

async function twoPeople() {
  const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
  const [myToken, graceToken] = await Promise.all([signIn(me.email), signIn(grace.email)]);
  const id = await startDirectVia(graceToken, me.id);
  return { me, grace, myToken, graceToken, id };
}

async function openAs(page: Page, account: Account, id: string) {
  await signInThroughTheForm(page, account);
  await page.goto(`/app/c/${id}`);
  await live(page);
}

/** Opens a Message's picker and chooses a reaction by its name ("thumbs up"). */
async function react(page: Page, row: ReturnType<typeof rowOf>, name: string) {
  await reactButton(row).click();
  await page.getByRole("menuitem", { name: new RegExp(name, "i") }).click();
}

function refuse(route: Route, status: 429 | 503) {
  return route.fulfill({
    status,
    headers: {
      "content-type": "application/problem+json",
      "retry-after": "20",
      "access-control-allow-origin": FRONTEND_URL,
      "access-control-allow-credentials": "true",
      "access-control-expose-headers": "Retry-After",
    },
    body: JSON.stringify({ title: "Refused", status }),
  });
}

test.describe("reacting to a Message", () => {
  test("a picker of six, a button under the Message named for what it does, one reaction per person, live for the other person", async ({
    page,
    openSession,
  }) => {
    const { me, grace, graceToken, id } = await twoPeople();
    await sendMessageVia(graceToken, id, "Worth a reaction");
    await openAs(page, me, id);
    const other = await openSession();
    await openAs(other, grace, id);
    const row = rowOf(page, "Worth a reaction");

    await reactButton(row).click();
    await expect(page.getByRole("menuitem")).toHaveCount(6);
    await expectAccessible(page, "the picker of reactions");
    await page.getByRole("menuitem", { name: /thumbs up/i }).click();

    await expect(chip(row, "React with thumbs up (1)")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(rowOf(other, "Worth a reaction"), "React with thumbs up (1)"), "live for the other person").toBeVisible();
    await expect(chip(rowOf(other, "Worth a reaction"), "React with thumbs up (1)")).toHaveAttribute("aria-pressed", "false");
    await expectAccessible(page, "a Message with a reaction");

    // The other person presses the same button: it counts both of them.
    await chip(rowOf(other, "Worth a reaction"), "React with thumbs up (1)").click();
    await expect(chip(row, "React with thumbs up (2)")).toBeVisible();

    // Choosing another emoji replaces, so there is still one reaction each.
    await react(page, row, "heart");
    await expect(chip(row, "React with heart (1)")).toBeVisible();
    await expect(chip(row, "React with thumbs up (1)")).toBeVisible();
    await expect(row.getByRole("button", { name: /^React with / })).toHaveCount(2);
    await expect(chip(rowOf(other, "Worth a reaction"), "React with heart (1)")).toBeVisible();

    // Pressing one's own reaction takes it away.
    await chip(row, "React with heart (1)").click();
    await expect(chip(row, "React with heart (1)")).toHaveCount(0);
    await expect(chip(rowOf(other, "Worth a reaction"), "React with heart (1)")).toHaveCount(0);

    await page.reload();
    await live(page);
    await expect(chip(rowOf(page, "Worth a reaction"), "React with thumbs up (1)")).toBeVisible();
  });

  test("in a Group it shows who chose each reaction", async ({ page }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const [adaToken, linusToken] = await Promise.all([signIn(ada.email), signIn(linus.email)]);
    const group = await createGroupVia(adaToken, "Trio", [me.id, linus.id]);
    const message = await sendMessageVia(adaToken, group, "Group news");
    await reactVia(adaToken, group, message, THUMBS_UP);
    await reactVia(linusToken, group, message, THUMBS_UP);
    await openAs(page, me, group);
    const row = rowOf(page, "Group news");

    await expect(chip(row, "React with thumbs up (2)")).toContainText("Ada, Linus");
    await expect(chip(row, "React with thumbs up (2)"), "what is seen is part of the name").toHaveAccessibleName(
      "React with thumbs up (2): Ada, Linus",
    );
    await expect(chip(row, "React with thumbs up (2)")).toHaveAccessibleDescription("Ada Lovelace, Linus Torvalds");

    await react(page, row, "thumbs up");
    await expect(chip(row, "React with thumbs up (3)")).toContainText("Ada, Linus +1");
    await expect(chip(row, "React with thumbs up (3)")).toHaveAccessibleDescription("Ada Lovelace, Linus Torvalds, You");
    await expectAccessible(page, "a Group Message with reactions");
  });
});

test.describe("seeing other people's reactions", () => {
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

  test("after the connection was lost, reactions made meanwhile are shown once it is back", async ({ page }) => {
    const { me, graceToken, id } = await twoPeople();
    const message = await sendMessageVia(graceToken, id, "Pending reactions");
    const sockets = await controlSocket(page);
    await openAs(page, me, id);
    await expect(rowOf(page, "Pending reactions")).toBeVisible();

    sockets.refuse = true;
    await sockets.current!.close();
    await expect(page.locator('[data-connection="reconnecting"]')).toBeAttached();
    await reactVia(graceToken, id, message, HEART);
    await expect(chip(rowOf(page, "Pending reactions"), "React with heart (1)"), "nothing arrives while it is down").toHaveCount(0);

    sockets.refuse = false;
    await expect(chip(rowOf(page, "Pending reactions"), "React with heart (1)")).toBeVisible({ timeout: 30_000 });
  });

  test("a reaction taken away, a Message deleted, or a person who left disappear live", async ({ page }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const [adaToken, linusToken] = await Promise.all([signIn(ada.email), signIn(linus.email)]);
    const group = await createGroupVia(adaToken, "Trio", [me.id, linus.id]);
    const kept = await sendMessageVia(adaToken, group, "Reacted to by two");
    const doomed = await sendMessageVia(adaToken, group, "Soon withdrawn");
    await reactVia(adaToken, group, kept, THUMBS_UP);
    await reactVia(linusToken, group, kept, HEART);
    await reactVia(linusToken, group, doomed, HEART);
    await openAs(page, me, group);
    await expect(chip(rowOf(page, "Reacted to by two"), "React with heart (1)")).toBeVisible();

    await unreactVia(adaToken, group, kept);
    await expect(chip(rowOf(page, "Reacted to by two"), "React with thumbs up (1)")).toHaveCount(0);

    await deleteMessageVia(adaToken, group, doomed);
    await expect(messages(page).getByText("This Message was deleted.")).toBeVisible();
    await expect(chip(messages(page).getByRole("listitem").filter({ hasText: "This Message was deleted." }), "React with heart (1)")).toHaveCount(0);
    await expect(
      reactButton(messages(page).getByRole("listitem").filter({ hasText: "This Message was deleted." })),
      "nothing to react to in a placeholder",
    ).toHaveCount(0);

    await removeParticipantVia(adaToken, group, linus.id);
    await expect(chip(rowOf(page, "Reacted to by two"), "React with heart (1)"), "Linus left, so his reaction goes").toHaveCount(0);
  });
});

test.describe("when it does not work, and from the keyboard", () => {
  test("a throttled or busy server says so calmly, keeps the picker open, and the next try works", async ({ page }) => {
    const { me, graceToken, id } = await twoPeople();
    await sendMessageVia(graceToken, id, "Try twice");
    await openAs(page, me, id);
    let answer: 429 | 503 | undefined = 429;
    await page.route(/\/messages\/[^/]+\/reaction$/, (route) =>
      route.request().method() === "PUT" && answer ? refuse(route, answer) : route.fallback(),
    );
    const row = rowOf(page, "Try twice");

    await reactButton(row).click();
    await page.getByRole("menuitem", { name: /heart/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "too often" })).toHaveText(
      "You are changing Messages too often. Try again in 20 seconds.",
    );
    answer = 503;
    await page.getByRole("menuitem", { name: /heart/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "busy" })).toHaveText("The server is busy. Try again in a moment.");
    await expectAccessible(page, "the picker after a refused reaction");

    answer = undefined;
    await page.getByRole("menuitem", { name: /heart/i }).click();
    await expect(chip(row, "React with heart (1)")).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("the picker opens from the keyboard, moves with the arrow keys, and gives focus back after a choice", async ({ page }) => {
    const { me, graceToken, id } = await twoPeople();
    await sendMessageVia(graceToken, id, "By keyboard");
    await openAs(page, me, id);
    const row = rowOf(page, "By keyboard");

    await reactButton(row).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: /thumbs up/i })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: /heart/i })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(reactButton(row)).toBeFocused();

    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(chip(row, "React with heart (1)")).toBeVisible();
    await expect(reactButton(row), "focus is back on the button").toBeFocused();

    // The chip is a plain button: Space on it takes the reaction away.
    await chip(row, "React with heart (1)").focus();
    await page.keyboard.press("Space");
    await expect(chip(row, "React with heart (1)")).toHaveCount(0);
  });
});
