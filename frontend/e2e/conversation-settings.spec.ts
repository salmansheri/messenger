import type { Page } from "@playwright/test";
import { FRONTEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import { createVerifiedAccount, sendMessageVia, signIn, startDirectVia, updateSettingsVia } from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";
import { index, rowFor, showIndex } from "./support/navigation";

const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();
const optionsButton = (page: Page) => page.getByRole("button", { name: "Options for this Conversation" });
const item = (page: Page, name: string) => page.getByRole("menuitem", { name, exact: true });
/** The line under the open Conversation's name that says what is set (pinned, muted, archived). */
const settingsLine = (page: Page) => page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header").locator("p.font-mono");

/** The person, signed in on `page`, with one Direct conversation per name; the first has the oldest Message and the last the newest. */
async function withConversations(page: Page, names: string[]) {
  const me = await createVerifiedAccount("Me Myself");
  const myToken = await signIn(me.email);
  const others = [] as { token: string; id: string; name: string }[];
  for (const name of names) {
    const other = await createVerifiedAccount(name);
    const token = await signIn(other.email);
    const id = await startDirectVia(token, me.id);
    await sendMessageVia(token, id, `Hello from ${name}`);
    others.push({ token, id, name });
  }
  await signInThroughTheForm(page, me);
  return { me, myToken, others };
}

async function choose(page: Page, name: string) {
  await optionsButton(page).click();
  await item(page, name).click();
}

function refuse(route: import("@playwright/test").Route, status: 503) {
  return route.fulfill({
    status,
    headers: {
      "content-type": "application/problem+json",
      "access-control-allow-origin": FRONTEND_URL,
      "access-control-allow-credentials": "true",
    },
    body: JSON.stringify({ title: "Service Unavailable", status }),
  });
}

test.describe("pinning", () => {
  test("a pinned Conversation goes to the top and says so, a second tab sees it live, and it stays after a reload", async ({
    page,
    openSession,
  }) => {
    const { me, others } = await withConversations(page, ["Ann Oldest", "Bea Middle", "Cy Newest"]);
    const [oldest, , newest] = others;
    const second = await openSession();
    await signInThroughTheForm(second, me);
    await expect(index(second).getByRole("listitem").first()).toContainText("Cy Newest");

    await page.goto(`/app/c/${oldest.id}`);
    await live(page);
    await choose(page, "Pin");

    await expect(settingsLine(page)).toHaveText("Pinned");
    await expect(index(second).getByRole("listitem").first(), "live in the other tab").toContainText("Ann Oldest");
    await expect(rowFor(second, oldest.id).getByText("Pinned.")).toBeAttached();
    await expect(rowFor(second, newest.id).getByText("Pinned.")).toHaveCount(0);

    await page.reload();
    await live(page);
    await expect(settingsLine(page)).toHaveText("Pinned");
    await showIndex(page);
    await expect(index(page).getByRole("listitem").first()).toContainText("Ann Oldest");
    await expectAccessible(page, "the list with a pinned Conversation");

    // A new Message in another Conversation does not take the top from the pinned one.
    await sendMessageVia(newest.token, newest.id, "Something newer");
    await expect(rowFor(page, newest.id)).toContainText("Something newer");
    await expect(index(page).getByRole("listitem").first()).toContainText("Ann Oldest");

    await page.goto(`/app/c/${oldest.id}`);
    await live(page);
    await choose(page, "Unpin");
    await expect(settingsLine(page)).toHaveCount(0);
    await showIndex(page);
    await expect(index(page).getByRole("listitem").first()).toContainText("Cy Newest");
  });

  test("a fourth pin is refused in plain words and nothing changes", async ({ page }) => {
    const { myToken, others } = await withConversations(page, ["One", "Two", "Three", "Four"]);
    for (const other of others.slice(0, 3)) await updateSettingsVia(myToken, other.id, { pinned: true });
    await page.goto(`/app/c/${others[3].id}`);
    await live(page);

    await optionsButton(page).click();
    await item(page, "Pin").click();

    await expect(page.getByRole("alert").filter({ hasText: "pin" })).toHaveText("You can pin at most 3 Conversations.");
    await expect(item(page, "Pin"), "the menu stays open").toBeVisible();
    await expectAccessible(page, "the settings menu after a refused pin");
    await page.keyboard.press("Escape");
    await expect(settingsLine(page)).toHaveCount(0);
  });
});

test.describe("archiving", () => {
  test("an archived Conversation leaves the list for an Archived view, which shows a dot for unread Messages, and can be brought back", async ({
    page,
    openSession,
  }) => {
    const { me, others } = await withConversations(page, ["Ann Archived", "Bea Stays"]);
    const [archived, stays] = others;
    const second = await openSession();
    await signInThroughTheForm(second, me);
    await page.goto(`/app/c/${archived.id}`);
    await live(page);

    await choose(page, "Archive");

    await expect(settingsLine(page)).toHaveText("Archived");
    await showIndex(page);
    await expect(rowFor(page, archived.id), "gone from the main list").toHaveCount(0);
    await expect(rowFor(page, stays.id)).toBeVisible();
    await expect(second.getByRole("button", { name: /^Archived \(1\)/ }), "live in the other tab").toBeVisible();
    await expect(rowFor(second, archived.id)).toHaveCount(0);

    // Reading it already, no dot; a new Message while it is archived puts one on the way in, and the archive stays.
    await expect(page.getByRole("button", { name: "Archived (1)" })).toBeVisible();
    await sendMessageVia(archived.token, archived.id, "Still archived?");
    await expect(page.getByRole("button", { name: /Archived \(1\) has unread Messages/ })).toBeVisible();
    await expect(rowFor(page, archived.id)).toHaveCount(0);

    await page.getByRole("button", { name: /^Archived/ }).click();
    await expect(rowFor(page, archived.id)).toContainText("Still archived?");
    await expect(rowFor(page, stays.id)).toHaveCount(0);
    await expectAccessible(page, "the Archived view");

    await rowFor(page, archived.id).click();
    await live(page);
    await choose(page, "Unarchive");
    await expect(settingsLine(page)).toHaveCount(0);
    await showIndex(page);
    await expect(rowFor(page, archived.id), "back in the main list").toBeVisible();
    await expect(page.getByRole("button", { name: /^Archived/ })).toHaveCount(0);
  });

  test("an archived Conversation cannot be pinned: the menu says to unarchive it first", async ({ page }) => {
    const { myToken, others } = await withConversations(page, ["Ann Archived"]);
    await updateSettingsVia(myToken, others[0].id, { archived: true });
    await page.goto(`/app/c/${others[0].id}`);
    await live(page);

    await optionsButton(page).click();
    await item(page, "Pin").click();

    await expect(page.getByRole("alert").filter({ hasText: "Unarchive" })).toHaveText("Unarchive it before pinning.");
    await expect(settingsLine(page)).toHaveText("Archived");
  });
});

test.describe("muting", () => {
  test("a muted Conversation says so and until when, still counts unread Messages, and can be unmuted", async ({ page }) => {
    const { others } = await withConversations(page, ["Ann Muted"]);
    const [muted] = others;
    await page.goto(`/app/c/${muted.id}`);
    await live(page);
    await expect(item(page, "Unmute")).toHaveCount(0);

    await choose(page, "Mute for 8 hours");

    await expect(settingsLine(page)).toHaveText(/^Muted until (tomorrow )?\d\d:\d\d$/);
    await expectAccessible(page, "a Conversation muted for 8 hours");
    await showIndex(page);
    await expect(rowFor(page, muted.id).getByText("Muted.")).toBeAttached();
    await sendMessageVia(muted.token, muted.id, "Do you hear me?");
    await expect(rowFor(page, muted.id)).toContainText("1 unread Message");

    await rowFor(page, muted.id).click();
    await live(page);
    await optionsButton(page).click();
    await expect(item(page, "Unmute")).toBeVisible();
    await item(page, "Mute always").click();
    await expect(settingsLine(page)).toHaveText("Muted");

    await choose(page, "Unmute");
    await expect(settingsLine(page)).toHaveCount(0);
    await showIndex(page);
    await expect(rowFor(page, muted.id).getByText("Muted.")).toHaveCount(0);
  });
});

test.describe("when it does not work, and from the keyboard", () => {
  test("a busy server says so calmly, keeps the menu open, and the next try works", async ({ page }) => {
    const { others } = await withConversations(page, ["Ann Busy"]);
    await page.goto(`/app/c/${others[0].id}`);
    await live(page);
    let busy = true;
    await page.route(/\/conversations\/[^/]+\/settings$/, (route) =>
      route.request().method() === "PATCH" && busy ? refuse(route, 503) : route.fallback(),
    );

    await optionsButton(page).click();
    await item(page, "Pin").click();
    await expect(page.getByRole("alert").filter({ hasText: "busy" })).toHaveText("The server is busy. Try again in a moment.");
    await expect(settingsLine(page)).toHaveCount(0);

    busy = false;
    await item(page, "Pin").click();
    await expect(settingsLine(page)).toHaveText("Pinned");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("the menu opens from the keyboard, moves with the arrow keys, closes with Escape and gives focus back", async ({ page }) => {
    const { others } = await withConversations(page, ["Ann Keys"]);
    await page.goto(`/app/c/${others[0].id}`);
    await live(page);

    await optionsButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(item(page, "Mute for 8 hours")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Mute for a week")).toBeFocused();
    await page.keyboard.press("End");
    await expect(item(page, "Pin")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(optionsButton(page)).toBeFocused();

    await page.keyboard.press("Enter");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(settingsLine(page)).toHaveText("Pinned");
    await expect(optionsButton(page), "focus is back on the button").toBeFocused();
  });
});
