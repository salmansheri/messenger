import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  createGroupVia,
  createVerifiedAccount,
  deliveredUpToVia,
  readUpToVia,
  sendMessageVia,
  signIn,
  startDirectVia,
} from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const index = (page: Page) => page.getByRole("navigation", { name: "Conversations" });
const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const rowFor = (page: Page, id: string) => index(page).locator(`a[href="/app/c/${id}"]`);
const mark = (page: Page, word: "Sent" | "Delivered" | "Read") => messages(page).getByRole("img", { name: word });
/** On a phone the list is its own screen: go back to it from an open Conversation (a desktop shows it already). */
async function showIndex(page: Page) {
  const back = page.getByRole("link", { name: "Conversations" });
  if (await back.isVisible()) await back.click();
}
const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();

/** The receipts a page sends, so a test can see what was (and was not) reported. */
function watchReports(page: Page) {
  const bodies: { deliveredSeq?: number; readSeq?: number }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/receipts")) bodies.push(request.postDataJSON());
  });
  return bodies;
}

test.describe("receipts in a Direct conversation", () => {
  test("a Message goes from sent to delivered when the other person's app has it, to read when they see it", async ({
    page,
    openSession,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);

    await composer(page).fill("Are you there?");
    await composer(page).press("Enter");
    await expect(mark(page, "Sent"), "nobody else has the app open").toBeVisible();

    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace); // her list loads, so the Message has reached her
    await expect(mark(page, "Delivered")).toBeVisible();
    await expect(mark(page, "Read")).toHaveCount(0);

    await theirs.goto(`/app/c/${id}`);
    await expect(messages(theirs).getByText("Are you there?")).toBeInViewport();
    await expect(mark(page, "Read")).toBeVisible();
    await expect(mark(page, "Delivered")).toHaveCount(0);
  });

  test("a tab that is not the one in use reports delivered but not read, until it is", async ({ page, openSession }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    await composer(page).fill("Look at this");
    await composer(page).press("Enter");
    await expect(mark(page, "Sent")).toBeVisible();

    const theirs = await openSession();
    await theirs.addInitScript(() => {
      (window as unknown as { focused: boolean }).focused = false;
      document.hasFocus = () => (window as unknown as { focused: boolean }).focused;
    });
    const reports = watchReports(theirs);
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await expect(messages(theirs).getByText("Look at this")).toBeInViewport();

    await expect(mark(page, "Delivered")).toBeVisible();
    await expect(mark(page, "Read")).toHaveCount(0);
    expect(reports.some((body) => body.deliveredSeq !== undefined)).toBe(true);
    expect(reports.some((body) => body.readSeq !== undefined), "not reported read while unfocused").toBe(false);

    await theirs.evaluate(() => {
      (window as unknown as { focused: boolean }).focused = true;
      window.dispatchEvent(new Event("focus"));
    });
    await expect(mark(page, "Read")).toBeVisible();
    expect(reports.some((body) => body.readSeq === 1)).toBe(true);
  });
});

test.describe("receipts in a Group", () => {
  test("a Message is read only when every other Participant has read it", async ({ page, openSession }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const [myToken, linusToken] = await Promise.all([signIn(me.email), signIn(linus.email)]);
    const group = await createGroupVia(myToken, "Analytical Engine", [ada.id, linus.id]);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${group}`);
    await live(page);
    await composer(page).fill("Hello everyone");
    await composer(page).press("Enter");
    await expect(mark(page, "Sent")).toBeVisible();

    // Ada has the app open and reads it.
    const adas = await openSession();
    await signInThroughTheForm(adas, ada);
    await adas.goto(`/app/c/${group}`);
    await expect(messages(adas).getByText("Hello everyone")).toBeInViewport();
    await showIndex(adas);
    await expect(rowFor(adas, group), "Ada has read it").not.toContainText("unread");
    await expect(mark(page, "Sent"), "Linus has not received it yet").toBeVisible();

    await deliveredUpToVia(linusToken, group, 1);
    await expect(mark(page, "Delivered")).toBeVisible();
    await expect(mark(page, "Read"), "Ada read it, Linus only has it").toHaveCount(0);

    await readUpToVia(linusToken, group, 1);
    await expect(mark(page, "Read")).toBeVisible();
  });
});

test.describe("unread counts", () => {
  test("fall as Messages are read, and agree in a second tab of the same person", async ({ page, openSession }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, id, "One");
    await sendMessageVia(graceToken, id, "Two");

    await signInThroughTheForm(page, me);
    const other = await openSession();
    await signInThroughTheForm(other, me);
    await live(page);
    await live(other);
    await expect(rowFor(page, id)).toContainText("2 unread Messages");
    await expect(rowFor(other, id)).toContainText("2 unread Messages");

    await rowFor(page, id).click();
    await expect(messages(page).getByText("Two")).toBeInViewport();
    await showIndex(page);

    await expect(rowFor(page, id)).not.toContainText("unread");
    await expect(rowFor(other, id), "the other tab agrees").not.toContainText("unread");

    // A new Message arriving while it is open is read at once, so the count does not climb.
    await rowFor(page, id).click();
    await sendMessageVia(graceToken, id, "Three");
    await expect(messages(page).getByText("Three")).toBeVisible();
    await expect(rowFor(other, id)).toContainText("Three");
    await expect(rowFor(other, id)).not.toContainText("unread");
    await showIndex(page);
    await expect(rowFor(page, id)).not.toContainText("unread");
  });

  test("only count down as far as the Messages that were actually on screen", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    for (let n = 1; n <= 60; n++) await sendMessageVia(graceToken, id, `Message ${n}`);
    await signInThroughTheForm(page, me);
    await expect(rowFor(page, id)).toContainText("60 unread Messages");

    await rowFor(page, id).click();
    await expect(messages(page).getByText("Message 1", { exact: true })).toBeInViewport();
    await showIndex(page);

    // Some were read, the rest (below the screen) are still unread.
    await expect(rowFor(page, id)).not.toContainText("60 unread");
    await expect(rowFor(page, id)).toContainText(/\d+ unread Messages/);
    await expect(rowFor(page, id)).not.toContainText("1 unread");
  });
});
