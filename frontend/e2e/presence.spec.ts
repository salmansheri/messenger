import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { createGroupVia, createVerifiedAccount, signIn, startDirectVia } from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const typingLine = (page: Page) => page.getByRole("status").filter({ hasText: /typing/ });
const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();
const header = (page: Page) => page.getByRole("banner").locator("xpath=following::main[1]");

/** The typing notices a page sends (`true` for typing, `false` for stopped), read off its WebSocket. */
async function watchTypingSent(page: Page) {
  const sent: boolean[] = [];
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const frame = String(message);
      if (frame.startsWith("SEND") && /destination:\/app\/conversations\/[^\n]+\/typing/.test(frame)) {
        const body = frame.split("\n\n")[1]?.replace(/\0$/, "") ?? "";
        sent.push((JSON.parse(body) as { typing: boolean }).typing);
      }
      server.send(message);
    });
  });
  return sent;
}

test.describe("presence", () => {
  test("the header shows whether the other person is online, live, and when they were last seen once they leave", async ({
    page,
    openSession,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    await expect(page.getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeVisible();
    await expect(header(page).getByText("Offline", { exact: true }), "she has never been seen").toBeVisible();

    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace);
    await expect(header(page).getByText("Online", { exact: true })).toBeVisible();

    await theirs.close();
    await expect(header(page).getByText(/^Last seen today at \d\d:\d\d$/)).toBeVisible({ timeout: 25_000 });
    await expect(header(page).getByText("Online", { exact: true })).toHaveCount(0);

    // Opening the Conversation later shows the same, from the server.
    await page.reload();
    await expect(header(page).getByText(/^Last seen today at \d\d:\d\d$/)).toBeVisible();
  });

  test("a Group lists its Participants, admins first, each with their own online state", async ({ page, openSession }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const group = await createGroupVia(await signIn(me.email), "Analytical Engine", [ada.id, linus.id]);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${group}`);
    await live(page);

    await page.getByText("Participants (3)").click();
    const list = page.getByRole("list", { name: "Participants" });
    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Me Myself (you)");
    await expect(items.nth(0)).toContainText("Admin");
    await expect(items.nth(1)).toContainText("Offline");
    await expect(items.nth(2)).toContainText("Offline");
    await expect(list.getByText("Online")).toHaveCount(0);

    const adas = await openSession();
    await signInThroughTheForm(adas, ada);
    await expect(list.getByRole("listitem").filter({ hasText: "Ada Lovelace" })).toContainText("Online");
    await expect(list.getByRole("listitem").filter({ hasText: "Linus Torvalds" })).toContainText("Offline");
  });

  test("is only asked about for the Conversation that is open, and only ever lists its Participants", async ({
    page,
    openSession,
  }) => {
    const [me, grace, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const withGrace = await startDirectVia(await signIn(grace.email), me.id);
    await startDirectVia(await signIn(linus.email), me.id);
    const asked: string[] = [];
    page.on("request", (request) => {
      const match = request.url().match(/\/conversations\/([0-9a-f-]{36})\/presence/);
      if (match) asked.push(match[1]);
    });
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${withGrace}`);
    await live(page);
    await expect(header(page).getByText("Offline", { exact: true })).toBeVisible();

    // Someone else comes online: it changes nothing here.
    const others = await openSession();
    await signInThroughTheForm(others, linus);
    await expect(header(page).getByText("Offline", { exact: true })).toBeVisible();
    expect(new Set(asked)).toEqual(new Set([withGrace]));
  });
});

test.describe("typing", () => {
  test("shows who is typing while they type, and stops when they empty the box or send", async ({ page, openSession }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await live(theirs);

    await composer(theirs).pressSequentially("hel");
    await expect(typingLine(page)).toHaveText("Grace Hopper is typing");

    await composer(theirs).fill("");
    await expect(typingLine(page)).toHaveCount(0);

    await composer(theirs).pressSequentially("one more");
    await expect(typingLine(page)).toHaveText("Grace Hopper is typing");
    await composer(theirs).press("Enter");
    await expect(typingLine(page)).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Messages" }).getByText("one more")).toBeVisible();
  });

  test("goes away by itself when the typist disappears without saying they stopped", async ({ page, openSession }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await live(theirs);

    await composer(theirs).pressSequentially("typing then gone");
    await expect(typingLine(page)).toHaveText("Grace Hopper is typing");
    await theirs.close();

    await expect(typingLine(page)).toHaveCount(0, { timeout: 15_000 });
  });

  test("names two people typing in a Group", async ({ page, openSession }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const group = await createGroupVia(await signIn(me.email), "Analytical Engine", [ada.id, linus.id]);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${group}`);
    await live(page);
    const [adas, linuses] = [await openSession(), await openSession()];
    await signInThroughTheForm(adas, ada);
    await adas.goto(`/app/c/${group}`);
    await signInThroughTheForm(linuses, linus);
    await linuses.goto(`/app/c/${group}`);
    await live(adas);
    await live(linuses);

    await composer(adas).pressSequentially("a");
    await expect(typingLine(page)).toHaveText("Ada Lovelace is typing");
    await composer(linuses).pressSequentially("b");
    await expect(typingLine(page)).toHaveText(/^(Ada Lovelace and Linus Torvalds|Linus Torvalds and Ada Lovelace) are typing$/);
    await expect(typingLine(adas), "Ada sees only Linus, not herself").toHaveText("Linus Torvalds is typing");
  });

  test("shares their own typing without flooding: one start for a burst, a stop when they send", async ({
    page,
    openSession,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    const theirs = await openSession();
    const sent = await watchTypingSent(theirs);
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await live(theirs);

    await composer(theirs).pressSequentially("hello there, friend", { delay: 80 }); // about 1.5 seconds of typing
    expect(sent, "twenty keystrokes, one notice").toEqual([true]);

    await composer(theirs).press("Enter");
    await expect.poll(() => sent).toEqual([true, false]);
  });

  test("tells the others when the person stops typing without sending", async ({ page, openSession }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const id = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await page.goto(`/app/c/${id}`);
    await live(page);
    const theirs = await openSession();
    const sent = await watchTypingSent(theirs);
    await signInThroughTheForm(theirs, grace);
    await theirs.goto(`/app/c/${id}`);
    await live(theirs);

    await composer(theirs).pressSequentially("thinking");
    await expect(typingLine(page)).toHaveText("Grace Hopper is typing");

    await expect(typingLine(page), "a few seconds after the last keystroke").toHaveCount(0, { timeout: 12_000 });
    expect(sent[0], "started with typing").toBe(true);
    expect(sent.at(-1), "ended with stopped").toBe(false);
    expect(sent.filter((typing) => !typing), "said stopped once").toHaveLength(1);
    expect(sent.length, "at most a start and a reminder before the stop").toBeLessThanOrEqual(3);
    await expect(composer(theirs)).toHaveValue("thinking");
  });
});
