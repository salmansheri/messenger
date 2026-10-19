import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { PASSWORD, createGroupVia, createVerifiedAccount, sendMessageVia, signIn, startDirectVia } from "./support/backend";
import { signInThroughTheForm, waitForForm } from "./support/auth-screens";

const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();

/** What has keyboard focus, and whether it shows (an outline, or a ring) so the person can see where they are. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return {
      name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? element.tagName,
      tag: element.tagName,
      visible: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
    };
  });

test.describe("keyboard", () => {
  test("a person can sign in, open a Conversation and send a Message without a mouse, always seeing where they are", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await sendMessageVia(await signIn(grace.email), id, "Hello from Grace");

    await page.goto("/sign-in");
    await waitForForm(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" }), "the first stop is a way past the header").toBeFocused();
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    await page.getByRole("main").getByLabel("Email address").focus();
    await page.keyboard.type(me.email);
    await page.keyboard.press("Tab");
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);

    // Every stop on the way through the list shows where focus is.
    const stops: { name: string; visible: boolean }[] = [];
    await page.getByRole("link", { name: "Rubric" }).focus();
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press("Tab");
      stops.push(await focused(page));
    }
    expect(stops.filter((stop) => !stop.visible), "every focused control has a visible outline").toEqual([]);

    await page.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: /Grace Hopper/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/app/c/${id}$`));
    await expect(messages(page).getByText("Hello from Grace")).toBeVisible();

    await page.getByRole("textbox", { name: "Message" }).focus();
    await page.keyboard.type("Typed with the keyboard");
    await page.keyboard.press("Enter");
    await expect(messages(page).getByText("Typed with the keyboard")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" }), "focus stays where the person is writing").toBeFocused();
  });

  test("a Group's panel opens with the keyboard, and the leave question puts focus where it is safe and gives it back", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const group = await createGroupVia(await signIn(me.email), "Analytical Engine", [grace.id]);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${group}`);
    await live(page);

    const summary = page.getByText("Participants (2)");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Participants" })).toBeVisible();

    await page.getByRole("button", { name: "Leave Group" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Leave this Group?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" }), "focus lands on the safe choice").toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.getByText("Leave this Group?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave Group" }), "and comes back to where it was").toBeFocused();
  });
});

test.describe("focus follows the person from screen to screen", () => {
  test("going to a Conversation, and back, puts focus on that screen's heading; a page load leaves the skip link first", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);

    await page.goto("/app");
    await expect(page.getByRole("navigation", { name: "Conversations" })).toBeVisible(); // the signed-in area appears once the session is checked
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" }), "a fresh page starts at the top").toBeFocused();

    await page.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: /Grace Hopper/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/app/c/${id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Grace Hopper" }), "focus is on the new screen").toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1, name: "Conversations" })).toBeFocused();

    await page.getByRole("link", { name: "Settings" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeFocused();
  });
});

test.describe("announcements and motion", () => {
  test("new Messages from other people are announced politely; the ones already there and your own are not", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, id, "Already here");
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const log = page.getByRole("log", { name: "New Messages" });
    await expect(messages(page).getByText("Already here")).toBeVisible();
    await expect(log, "what was there when the view opened is not announced").toHaveText("");

    await page.getByRole("textbox", { name: "Message" }).fill("My own words");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(messages(page).getByText("My own words")).toBeVisible();
    await expect(log, "your own Message is not announced").toHaveText("");

    await sendMessageVia(graceToken, id, "Something\nnew");
    await expect(log).toHaveText("Grace Hopper: Something new");
    expect(await log.evaluate((element) => getComputedStyle(element).position), "it is out of sight, not removed").toBe("absolute");
  });

  test("Messages caught up after a lost connection are announced as a count, not read out one by one", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const graceToken = await signIn(grace.email);
    const id = await startDirectVia(graceToken, me.id);
    const refuse = { on: false };
    let current: WebSocketRoute | undefined;
    await page.routeWebSocket(/\/ws$/, (ws) => {
      if (refuse.on) {
        void ws.close();
        return;
      }
      ws.connectToServer();
      current = ws;
    });
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const log = page.getByRole("log", { name: "New Messages" });

    refuse.on = true;
    await current!.close();
    await expect(page.locator('[data-connection="reconnecting"]')).toBeAttached();
    for (let n = 1; n <= 5; n++) await sendMessageVia(graceToken, id, `Missed ${n}`);
    refuse.on = false;

    await expect(messages(page).getByText("Missed 5")).toBeVisible({ timeout: 30_000 });
    await expect(log).toHaveText("5 new Messages");
  });

  test("with reduced motion the typing dots stand still and transitions are all but instant", async ({ page, openSession }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await live(theirs);
    await theirs.getByRole("textbox", { name: "Message" }).pressSequentially("typing for a while");

    const dots = page.getByRole("status").filter({ hasText: "Grace Hopper is typing" }).locator("span span");
    await expect(dots.first()).toBeVisible();
    const running = () => dots.first().evaluate((element) => element.getAnimations().length);
    await expect.poll(running, { message: "the dots pulse" }).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(running, { message: "with reduced motion they do not" }).toBe(0);
    const duration = await page
      .getByRole("button", { name: "Send" })
      .evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration));
    expect(duration, "transitions are practically instant").toBeLessThan(0.001);
  });
});
