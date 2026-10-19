import { BACKEND_URL } from "./playwright-urls";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  createGroupVia,
  createVerifiedAccount,
  messagesVia,
  readUpToVia,
  sendMessageVia,
  signIn,
  startDirectVia,
} from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });

/** Two people with a Direct conversation; `me` is signed in on `page`. */
async function aConversation(page: Page, mine = "Me Myself", theirs = "Grace Hopper") {
  const [me, grace] = await Promise.all([createVerifiedAccount(mine), createVerifiedAccount(theirs)]);
  const [myToken, graceToken] = await Promise.all([signIn(me.email), signIn(grace.email)]);
  const id = await startDirectVia(graceToken, me.id);
  await signInThroughTheForm(page, me);
  return { me, grace, myToken, graceToken, id };
}

const openConversation = async (page: Page, id: string) => {
  await page.getByRole("navigation", { name: "Conversations" }).locator(`a[href="/app/c/${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/app/c/${id}$`));
};

test.describe("reading Messages", () => {
  test("shows them in order, newest at the bottom, with the sender named once per run and a heading for the day", async ({
    page,
  }) => {
    const { graceToken, myToken, id } = await aConversation(page);
    await sendMessageVia(graceToken, id, "First");
    await sendMessageVia(graceToken, id, "Second");
    await sendMessageVia(myToken, id, "Third, from me");
    await openConversation(page, id);

    const list = messages(page);
    await expect(list.getByRole("heading", { name: "Today" })).toBeVisible();
    const bodies = list.getByRole("listitem").filter({ has: page.locator("time") });
    await expect(bodies).toHaveCount(3);
    await expect(bodies.nth(0)).toContainText("First");
    await expect(bodies.nth(1)).toContainText("Second");
    await expect(bodies.nth(2)).toContainText("Third, from me");
    await expect(list.getByText("Grace Hopper", { exact: true }), "named once for the run of two").toHaveCount(1);
    await expect(list.getByText("You", { exact: true })).toHaveCount(1);
    await expect(bodies.first().locator("time")).toHaveText(/^\d\d:\d\d$/);
  });

  test("names each sender in a Group, and a Group member only sees what was said after they joined", async ({
    page,
  }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const [adaToken, linusToken] = await Promise.all([signIn(ada.email), signIn(linus.email)]);
    const group = await createGroupVia(adaToken, "Analytical Engine", [linus.id]);
    await sendMessageVia(adaToken, group, "Before Me joined");
    await fetch(`${BACKEND_URL}/api/v1/conversations/${group}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adaToken}` },
      body: JSON.stringify({ userId: me.id }),
    });
    await sendMessageVia(linusToken, group, "Welcome");
    await sendMessageVia(adaToken, group, "Hello Me");
    await signInThroughTheForm(page, me);
    await openConversation(page, group);

    const list = messages(page);
    await expect(list).toContainText("Welcome");
    await expect(list.getByText("Before Me joined")).toHaveCount(0);
    await expect(list.getByText("Linus Torvalds", { exact: true })).toHaveCount(1);
    await expect(list.getByText("Ada Lovelace", { exact: true })).toHaveCount(1);
  });

  test("keeps line breaks, and wraps long words and links instead of breaking the layout", async ({ page }) => {
    const { graceToken, id } = await aConversation(page);
    const longWord = "x".repeat(300);
    const link = `https://example.com/${"path/".repeat(60)}`;
    await sendMessageVia(graceToken, id, "line one\nline two\n\nafter a gap");
    await sendMessageVia(graceToken, id, `${longWord} ${link}`);
    await openConversation(page, id);

    const first = messages(page).getByText("line one", { exact: false });
    await expect(first).toBeVisible();
    expect(await first.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("pre-wrap");
    const box = await first.boundingBox();
    expect(box!.height, "four lines of text").toBeGreaterThan(60);

    const page_ = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      view: document.documentElement.clientWidth,
    }));
    expect(page_.scroll, "the page does not scroll sideways").toBeLessThanOrEqual(page_.view);
    const scroller = messages(page).locator("xpath=..");
    expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test("opens at the bottom when caught up, loads older Messages when scrolled up without moving the reading position, and offers a jump to the latest", async ({
    page,
  }) => {
    const { graceToken, myToken, id } = await aConversation(page);
    for (let n = 1; n <= 105; n++) await sendMessageVia(graceToken, id, `Message number ${n}`);
    await readUpToVia(myToken, id, 105);
    await page.reload();
    await openConversation(page, id);

    const list = messages(page);
    await expect(list.getByText("Message number 105", { exact: true })).toBeInViewport();
    await expect(list.getByText("Message number 1", { exact: true }), "the oldest ones are not loaded yet").toHaveCount(0);
    await expect(page.getByRole("button", { name: "Jump to latest" })).toBeHidden();

    // Scroll up to the oldest loaded Message; the next page loads by itself.
    const scroller = list.locator("xpath=..");
    await scroller.evaluate((element) => (element.scrollTop = 0));
    await expect(list.getByText("Message number 55", { exact: true })).toHaveCount(1);
    await expect(list.getByText("Message number 6", { exact: true }), "one more page of 50 came in").toHaveCount(1);

    // What was being read has not moved: the oldest of the first page is still at the top, not shoved out of view.
    const oldestLoaded = list.getByText("Message number 56", { exact: true });
    await expect(oldestLoaded).toBeInViewport();

    await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    await page.getByRole("button", { name: "Jump to latest" }).click();
    await expect(list.getByText("Message number 105", { exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Jump to latest" })).toBeHidden();
  });

  test("keeps the Message being read in the same place while older Messages load above it", async ({ page }) => {
    const { graceToken, myToken, id } = await aConversation(page);
    for (let n = 1; n <= 70; n++) await sendMessageVia(graceToken, id, `Line ${n}`);
    await readUpToVia(myToken, id, 70);
    await page.reload();
    await openConversation(page, id);

    const list = messages(page);
    const scroller = list.locator("xpath=..");
    await expect(list.getByText("Line 70", { exact: true })).toBeInViewport();
    await scroller.evaluate((element) => (element.scrollTop = 0));
    // 70 Messages with the default page of 50: Line 21 is the oldest loaded at first.
    const anchorMessage = list.getByText("Line 21", { exact: true });
    const before = (await anchorMessage.boundingBox())!.y - (await scroller.boundingBox())!.y;

    await expect(list.getByText("Line 1", { exact: true })).toHaveCount(1);
    await expect.poll(async () => Math.abs((await anchorMessage.boundingBox())!.y - (await scroller.boundingBox())!.y - before)).toBeLessThan(4);
  });

  test("opens at the first unread Message, marked, when there are unread Messages", async ({ page }) => {
    const { graceToken, myToken, id } = await aConversation(page);
    for (let n = 1; n <= 3; n++) await sendMessageVia(graceToken, id, `Read already ${n}`);
    await readUpToVia(myToken, id, 3);
    for (let n = 1; n <= 60; n++) await sendMessageVia(graceToken, id, `Newer ${n}`);
    await page.reload();
    await openConversation(page, id);

    const list = messages(page);
    await expect(list.getByText("Unread", { exact: true })).toBeInViewport();
    await expect(list.getByText("Newer 1", { exact: true })).toBeInViewport();
    await expect(list.getByText("Newer 60", { exact: true }), "not yanked to the bottom").not.toBeInViewport();
  });

  test("reads on a phone as well, with the writing box at the bottom of the screen", async ({ page }) => {
    const { graceToken, id } = await aConversation(page);
    await sendMessageVia(graceToken, id, "Hello phone");
    await openConversation(page, id);

    await expect(messages(page).getByText("Hello phone")).toBeInViewport();
    await expect(composer(page)).toBeInViewport();
    await expect(page.getByRole("button", { name: "Send" })).toBeInViewport();
  });

  test("a Conversation that is not the person's shows a plain not found and nothing to write in", async ({ page }) => {
    const { graceToken, grace } = await aConversation(page);
    const strangerToken = await signIn((await createVerifiedAccount("Stranger")).email);
    const theirs = await startDirectVia(strangerToken, grace.id);
    void graceToken;

    for (const id of [theirs, crypto.randomUUID()]) {
      await page.goto(`/app/c/${id}`);
      await expect(page.getByText("This Conversation was not found.")).toBeVisible();
      await expect(composer(page)).toHaveCount(0);
    }
  });
});

test.describe("sending Messages", () => {
  test("sends with the keyboard, shows it at once, and it is still there after a reload", async ({ page }) => {
    const { myToken, id } = await aConversation(page);
    await openConversation(page, id);

    await composer(page).fill("Hello from the keyboard");
    await composer(page).press("Enter");

    await expect(composer(page)).toHaveValue("");
    await expect(messages(page).getByText("Hello from the keyboard")).toBeVisible();
    await expect(messages(page).getByText("Sending…")).toHaveCount(0);
    expect((await messagesVia(myToken, id)).map((m) => m.body)).toEqual(["Hello from the keyboard"]);

    await page.reload();
    await expect(messages(page).getByText("Hello from the keyboard")).toBeVisible();
    await expect(messages(page).getByText("You", { exact: true })).toBeVisible();
  });

  test("shows the Message as sending while the server has not answered yet", async ({ page }) => {
    const { id } = await aConversation(page);
    await openConversation(page, id);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/conversations/${id}/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await gate;
      await route.continue();
    });

    await composer(page).fill("Slow one");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(messages(page).getByText("Slow one")).toBeVisible();
    await expect(messages(page).getByText("Sending…")).toBeVisible();

    release();
    await expect(messages(page).getByText("Sending…")).toHaveCount(0);
    await expect(messages(page).getByText("Slow one")).toBeVisible();
  });

  test("Shift+Enter writes a new line and the line breaks are kept", async ({ page }) => {
    const { myToken, id } = await aConversation(page);
    await openConversation(page, id);

    await composer(page).fill("one");
    await composer(page).press("Shift+Enter");
    await composer(page).pressSequentially("two");
    await composer(page).press("Enter");

    await expect.poll(async () => (await messagesVia(myToken, id)).map((m) => m.body)).toEqual(["one\ntwo"]);
    await expect(messages(page).getByText("one", { exact: false })).toContainText("two");
  });

  test("when the connection fails the Message says not sent, and Retry delivers exactly one copy even if the first try had reached the server", async ({
    page,
  }) => {
    const { myToken, id } = await aConversation(page);
    await openConversation(page, id);
    let attempts = 0;
    await page.route(`**/conversations/${id}/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      attempts++;
      if (attempts === 1) {
        await route.fetch(); // the server stores it, but the answer never makes it back
        return route.abort("connectionreset");
      }
      return route.continue();
    });

    await composer(page).fill("Needs a retry");
    await composer(page).press("Enter");

    const row = messages(page).getByRole("listitem").filter({ hasText: "Needs a retry" });
    await expect(row.getByText("Not sent.")).toBeVisible();
    await expect(row.getByText("Could not reach the server")).toBeVisible();
    await row.getByRole("button", { name: "Retry" }).click();

    await expect(row.getByText("Not sent.")).toHaveCount(0);
    await expect(messages(page).getByText("Needs a retry")).toHaveCount(1);
    expect(attempts).toBe(2);
    expect((await messagesVia(myToken, id)).filter((m) => m.body === "Needs a retry"), "one copy on the server").toHaveLength(1);

    await page.reload();
    await expect(messages(page).getByText("Needs a retry")).toHaveCount(1);
  });

  test("a failed Message that never reached the server is delivered once by Retry", async ({ page }) => {
    const { myToken, id } = await aConversation(page);
    await openConversation(page, id);
    let failing = true;
    await page.route(`**/conversations/${id}/messages`, (route) =>
      route.request().method() === "POST" && failing ? route.abort("internetdisconnected") : route.fallback(),
    );

    await composer(page).fill("Offline words");
    await composer(page).press("Enter");
    const row = messages(page).getByRole("listitem").filter({ hasText: "Offline words" });
    await expect(row.getByText("Not sent.")).toBeVisible();
    expect(await messagesVia(myToken, id)).toEqual([]);

    failing = false;
    await row.getByRole("button", { name: "Retry" }).click();
    await expect.poll(async () => (await messagesVia(myToken, id)).map((m) => m.body)).toEqual(["Offline words"]);
    await expect(row.getByText("Not sent.")).toHaveCount(0);
    await expect(messages(page).getByText("Offline words")).toHaveCount(1);
  });

  test("says clearly when a Message is empty, too long or has a character that cannot be stored, and sends nothing", async ({
    page,
  }) => {
    const { myToken, id } = await aConversation(page);
    await openConversation(page, id);
    const alert = page.getByRole("main").getByRole("alert");

    await composer(page).press("Enter");
    await expect(alert).toHaveText("Write something to send.");
    await composer(page).fill("  \n  ");
    await composer(page).press("Enter");
    await expect(alert).toHaveText("Write something to send.");

    await composer(page).fill("a".repeat(4001));
    await composer(page).press("Enter");
    await expect(alert).toHaveText("This Message has 4,001 characters; the limit is 4,000.");

    await composer(page).fill("bad \u0000 char");
    await composer(page).press("Enter");
    await expect(alert).toContainText("contains a character that cannot be sent");

    await composer(page).pressSequentially("x");
    await expect(alert, "editing clears the message").toHaveCount(0);
    expect(await messagesVia(myToken, id)).toEqual([]);

    await composer(page).fill("a".repeat(4000));
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue("");
    await expect.poll(async () => (await messagesVia(myToken, id)).length).toBe(1);
  });

  test("a sent Message moves the Conversation to the top of the list with the new line", async ({ page }) => {
    const { id } = await aConversation(page);
    await openConversation(page, id);

    await composer(page).fill("Latest words");
    await composer(page).press("Enter");

    const back = page.getByRole("link", { name: "Conversations" }); // only on screen on a phone, where the list is its own page
    if (await back.isVisible()) await back.click();
    await expect(page.getByRole("navigation", { name: "Conversations" }).locator(`a[href="/app/c/${id}"]`)).toContainText(
      "You: Latest words",
    );
  });
});
