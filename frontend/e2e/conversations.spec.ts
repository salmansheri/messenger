import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  createGroupVia,
  createUnverifiedAccount,
  createVerifiedAccount,
  sendMessageVia,
  signIn,
  startDirectVia,
} from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";

const index = (page: Page) => page.getByRole("navigation", { name: "Conversations" });
const idFrom = (page: Page) => new URL(page.url()).pathname.split("/").pop();

test.describe("the Conversation index", () => {
  test("a new person sees a friendly empty state that points to starting a Conversation", async ({ page }) => {
    await signInThroughTheForm(page, await createVerifiedAccount());

    await expect(page.getByText("You have no Conversations yet.")).toBeVisible();
    await page.getByRole("link", { name: "Start a Conversation" }).click();

    await expect(page).toHaveURL(/\/app\/new$/);
    await expect(page.getByRole("heading", { name: "Start a Conversation" })).toBeVisible();
  });

  test("lists Conversations most recently active first, with names, the latest line, the time and unread counts", async ({
    page,
  }) => {
    const [me, grace, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const [graceToken, linusToken] = await Promise.all([signIn(grace.email), signIn(linus.email)]);
    const withLinus = await startDirectVia(linusToken, me.id);
    const group = await createGroupVia(graceToken, "Analytical Engine", [me.id, linus.id]);
    const withGrace = await startDirectVia(graceToken, me.id);
    await sendMessageVia(linusToken, withLinus, "Lunch tomorrow?");
    await sendMessageVia(linusToken, group, "Notes attached");
    await sendMessageVia(graceToken, withGrace, "Hello");
    await sendMessageVia(graceToken, withGrace, "Are you free\nat   nine?");

    await signInThroughTheForm(page, me);

    const items = index(page).getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Grace Hopper");
    await expect(items.nth(0)).toContainText("Are you free at nine?");
    await expect(items.nth(0)).toContainText("2 unread Messages");
    await expect(items.nth(1)).toContainText("Analytical Engine");
    await expect(items.nth(1)).toContainText("Linus Torvalds: Notes attached");
    await expect(items.nth(1)).toContainText("1 unread Message");
    await expect(items.nth(2)).toContainText("Linus Torvalds");
    await expect(items.nth(2)).toContainText("Lunch tomorrow?");
    await expect(items.nth(2)).toContainText("1 unread Message");
    await expect(items.nth(0).locator("time")).toHaveText(/^\d\d:\d\d$/);
  });

  test("shows your own latest Message as yours and does not count it as unread", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const [meToken, graceToken] = await Promise.all([signIn(me.email), signIn(grace.email)]);
    const conversation = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, conversation, "Are you there?");
    await sendMessageVia(meToken, conversation, "On my way");

    await signInThroughTheForm(page, me);

    const item = index(page).getByRole("listitem").first();
    await expect(item).toContainText("You: On my way");
    await expect(item).not.toContainText("unread");
  });

  test("is built from one request for the whole list, not one per Conversation", async ({ page }) => {
    const [me, grace, linus, ada] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Linus Torvalds"),
      createVerifiedAccount("Ada Lovelace"),
    ]);
    for (const other of [grace, linus, ada]) await startDirectVia(await signIn(other.email), me.id);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/conversations")) requests.push(new URL(request.url()).pathname);
    });

    await signInThroughTheForm(page, me);
    await expect(index(page).getByRole("listitem")).toHaveCount(3);

    expect(requests.filter((path) => path === "/api/v1/conversations")).toHaveLength(1);
    expect(requests.filter((path) => /\/conversations\/[0-9a-f-]{36}/.test(path))).toEqual([]);
  });
});

test.describe("starting a Direct conversation", () => {
  test("opens a new one by the other person's exact address, and the same one again next time, whoever starts it", async ({
    page,
    openSession,
  }, testInfo) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    await signInThroughTheForm(page, me);

    await page.goto("/app/new");
    await page.getByLabel("Their email address").fill(`  ${grace.email.toUpperCase()} `);
    await page.getByRole("button", { name: "Start Conversation" }).click();

    await expect(page).toHaveURL(/\/app\/c\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Grace Hopper", level: 1 })).toBeVisible();
    const opened = idFrom(page);
    if (testInfo.project.name !== "phone") {
      // (on a phone the list steps aside while a Conversation is open)
      await expect(index(page).getByRole("link", { name: /Grace Hopper/ })).toHaveAttribute("aria-current", "page");
    }

    await page.goto("/app/new");
    await page.getByLabel("Their email address").fill(grace.email);
    await page.getByRole("button", { name: "Start Conversation" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/c/${opened}$`));
    await page.goto("/app");
    await expect(index(page).getByRole("listitem"), "no second Conversation was made").toHaveCount(1);

    const theirs = await openSession();
    await signInThroughTheForm(theirs, grace);
    await theirs.goto("/app/new");
    await theirs.getByLabel("Their email address").fill(me.email);
    await theirs.getByRole("button", { name: "Start Conversation" }).click();
    await expect(theirs).toHaveURL(new RegExp(`/app/c/${opened}$`));
  });

  test("says clearly when nobody can be reached at that address, whether it is unknown or never verified", async ({
    page,
  }) => {
    const unverified = await createUnverifiedAccount();
    await signInThroughTheForm(page, await createVerifiedAccount());
    await page.goto("/app/new");
    const nobody = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";

    await page.getByLabel("Their email address").fill("nobody-at-all@example.com");
    await page.getByRole("button", { name: "Start Conversation" }).click();
    await expect(page.getByText(nobody)).toBeVisible();

    await page.getByLabel("Their email address").fill(unverified.email);
    await expect(page.getByText(nobody), "editing the address clears the old message").toBeHidden();
    await page.getByRole("button", { name: "Start Conversation" }).click();
    await expect(page.getByText(nobody), "an address never verified gets exactly the same answer").toBeVisible();
    await expect(page).toHaveURL(/\/app\/new$/);
  });

  test("says clearly that you cannot start one with yourself", async ({ page }) => {
    const me = await createVerifiedAccount();
    await signInThroughTheForm(page, me);
    await page.goto("/app/new");

    await page.getByLabel("Their email address").fill(me.email);
    await page.getByRole("button", { name: "Start Conversation" }).click();

    await expect(page.getByText("You cannot start a Conversation with yourself.")).toBeVisible();
    await expect(page.getByLabel("Their email address")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/app\/new$/);
  });

  test("checks the address before asking the server, and a message goes away when the address is edited", async ({
    page,
  }) => {
    await signInThroughTheForm(page, await createVerifiedAccount());
    await page.goto("/app/new");
    const lookups: string[] = [];
    page.on("request", (request) => request.url().includes("/users/lookup") && lookups.push(request.url()));

    await page.getByLabel("Their email address").fill("not an address");
    await page.getByRole("button", { name: "Start Conversation" }).click();
    await expect(page.getByText("Enter a valid email address, like ada@example.com.")).toBeVisible();
    expect(lookups).toEqual([]);

    await page.getByLabel("Their email address").fill("nobody-at-all@example.com");
    await page.getByRole("button", { name: "Start Conversation" }).click();
    await expect(page.getByText(/No verified user has that email address/)).toBeVisible();
    await page.getByLabel("Their email address").fill("nobody-at-all@example.co");
    await expect(page.getByText(/No verified user has that email address/)).toBeHidden();
  });
});

test.describe("opening a Conversation that is not there", () => {
  test("an unknown id and someone else's Conversation get the same plain answer", async ({ page }) => {
    const [me, grace, linus] = await Promise.all([
      createVerifiedAccount(),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    const others = await startDirectVia(await signIn(grace.email), linus.id);
    await signInThroughTheForm(page, me);

    await page.goto("/app/c/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("This Conversation was not found.")).toBeVisible();

    await page.goto(`/app/c/${others}`);
    await expect(page.getByText("This Conversation was not found.")).toBeVisible();
    await expect(page.getByText("Grace Hopper")).toBeHidden();
  });
});

test.describe("on a desktop and on a phone", () => {
  test("the index and the open Conversation share the screen on a desktop and take turns on a phone", async ({
    page,
  }, testInfo) => {
    const phone = testInfo.project.name === "phone";
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const conversation = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    await expect(index(page).getByRole("link", { name: /Grace Hopper/ })).toBeVisible();

    // nothing open: the index alone on a phone; the index and an invitation on a desktop
    if (phone) await expect(page.getByText("Pick a Conversation")).toBeHidden();
    else await expect(page.getByText("Pick a Conversation")).toBeVisible();

    await index(page).getByRole("link", { name: /Grace Hopper/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/c/${conversation}$`));
    await expect(page.getByRole("heading", { name: "Grace Hopper", level: 1 })).toBeVisible();

    if (phone) {
      await expect(index(page), "the list steps aside").toBeHidden();
      await page.getByRole("link", { name: /Conversations/ }).click(); // the way back
      await expect(page).toHaveURL(/\/app$/);
      await expect(index(page).getByRole("link", { name: /Grace Hopper/ })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Grace Hopper", level: 1 })).toBeHidden();
    } else {
      await expect(index(page).getByRole("link", { name: /Grace Hopper/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /← Conversations/ })).toBeHidden();
    }
  });
});

test.describe("navigating", () => {
  test("the browser's Back button returns from a Conversation to the list", async ({ page }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);

    await index(page).getByRole("link", { name: /Grace Hopper/ }).click();
    await expect(page).toHaveURL(/\/app\/c\/[0-9a-f-]{36}$/);
    await page.goBack();

    await expect(page).toHaveURL(/\/app$/);
    await expect(index(page).getByRole("link", { name: /Grace Hopper/ })).toBeVisible();
  });

  test("every screen has exactly one top-level heading, and the list is labelled by its own heading", async ({
    page,
  }) => {
    const [me, grace] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Grace Hopper")]);
    const conversation = await startDirectVia(await signIn(grace.email), me.id);
    await signInThroughTheForm(page, me);
    const topLevel = page.getByRole("heading", { level: 1 });

    await expect(index(page).getByRole("link", { name: /Grace Hopper/ })).toBeVisible();
    await expect(topLevel).toHaveCount(1);
    await expect(topLevel).toHaveText("Conversations");

    for (const [path, title] of [
      ["/app/new", "Start a Conversation"],
      [`/app/c/${conversation}`, "Grace Hopper"],
      ["/app/c/00000000-0000-0000-0000-000000000000", "Conversation"],
      ["/app/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      await expect(topLevel, path).toHaveCount(1);
      await expect(topLevel, path).toHaveText(title);
    }
  });
});

