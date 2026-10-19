import type { Page } from "@playwright/test";
import { FRONTEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { conversationVia, createGroupVia, createVerifiedAccount, signIn } from "./support/backend";
import { signInThroughTheForm } from "./support/auth-screens";
import { index, rowFor, showIndex } from "./support/navigation";

const live = (page: Page) => expect(page.locator('[data-connection="connected"]')).toBeAttached();
const participants = (page: Page) => page.getByRole("list", { name: "Participants" }).getByRole("listitem");
const summary = (page: Page, count: number) => page.getByText(`Participants (${count})`, { exact: true });
const NOBODY = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";

async function openGroup(page: Page, id: string, count: number) {
  await page.goto(`/app/c/${id}`);
  await live(page);
  await summary(page, count).click();
}

test.describe("creating a Group", () => {
  test("checks the name and each address as it goes, shows who is being added, and opens the new Group for everyone", async ({
    page,
    openSession,
  }) => {
    const [me, ada, linus] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Ada Lovelace"),
      createVerifiedAccount("Linus Torvalds"),
    ]);
    await signInThroughTheForm(page, me);
    const adas = await openSession();
    await signInThroughTheForm(adas, ada);
    await live(adas);

    await page.goto("/app/new");
    await expect(page.getByRole("link", { name: "Create a Group" })).toHaveAttribute("href", "/app/new/group");
    await page.goto("/app/new/group"); // (a first visit compiles the page, which can take longer than a click is given)
    await expect(page.getByRole("heading", { level: 1, name: "New Group" })).toBeVisible();

    const name = page.getByLabel("Group name");
    const address = page.getByLabel("Add a person by email");
    const create = page.getByRole("button", { name: "Create Group" });

    await create.click();
    await expect(page.getByText("Give the Group a name.")).toBeVisible();
    await name.fill("x".repeat(101));
    await expect(page.getByText("Use at most 100 characters.")).toBeVisible();
    await name.fill("Analytical Engine");
    await create.click();
    await expect(page.getByText("Add at least one person.")).toBeVisible();

    await address.fill("not an address");
    await address.press("Enter");
    await expect(page.getByText("Enter a valid email address, like ada@example.com.")).toBeVisible();
    await address.fill("nobody-at-all@example.com");
    await address.press("Enter");
    await expect(page.getByText(NOBODY)).toBeVisible();
    await address.fill(me.email);
    await address.press("Enter");
    await expect(page.getByText("You are already in the Group.")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/new\/group$/); // Enter in the address box adds; it never creates

    await address.fill(ada.email);
    await address.press("Enter");
    const chips = page.getByRole("list", { name: "People in this Group" }).getByRole("listitem");
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText("Ada Lovelace");
    await expect(chips.first()).toContainText(ada.email);
    await expect(address).toHaveValue("");

    await address.fill(ada.email);
    await address.press("Enter");
    await expect(page.getByText("Ada Lovelace is already in the list.")).toBeVisible();

    await page.getByRole("button", { name: "Remove Ada Lovelace" }).click();
    await expect(chips).toHaveCount(0);
    await address.fill(ada.email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(chips).toHaveCount(1);
    await address.fill(linus.email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(chips).toHaveCount(2);

    await create.click();
    await expect(page).toHaveURL(/\/app\/c\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Analytical Engine" })).toBeVisible();
    await summary(page, 3).click();
    await expect(participants(page).first()).toContainText("Me Myself (you)");
    await expect(participants(page).first()).toContainText("Admin");

    // The people in it see it appear in their list, with no reload.
    await expect(index(adas).getByRole("link", { name: /Analytical Engine/ })).toBeVisible();
  });
});

test.describe("managing a Group", () => {
  /** Ada's Group "Analytical Engine" with Me (Admin), Grace and Linus (members), and Ada in the browser too. */
  async function aGroup(page: Page, openSession: () => Promise<Page>) {
    const [me, grace, linus, ada] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Linus Torvalds"),
      createVerifiedAccount("Ada Lovelace"),
    ]);
    const myToken = await signIn(me.email);
    const group = await createGroupVia(myToken, "Analytical Engine", [grace.id, linus.id]);
    await signInThroughTheForm(page, me);
    await openGroup(page, group, 3);
    const graces = await openSession();
    await signInThroughTheForm(graces, grace);
    await openGroup(graces, group, 3);
    const linuses = await openSession();
    await signInThroughTheForm(linuses, linus);
    await openGroup(linuses, group, 3);
    return { me, grace, linus, ada, group, myToken, graces, linuses };
  }

  test("an Admin renames, adds, promotes and removes, everyone sees it live, and a member has none of those controls", async ({
    page,
    openSession,
  }) => {
    const { ada, group, graces, linuses } = await aGroup(page, openSession);

    // A member's panel: the Participants and a way to leave, nothing to change.
    await expect(participants(graces)).toHaveCount(3);
    await expect(graces.getByLabel("Group name")).toHaveCount(0);
    await expect(graces.getByLabel("Add a person by email")).toHaveCount(0);
    await expect(graces.getByRole("button", { name: /^(Remove|Promote)/ })).toHaveCount(0);
    await expect(graces.getByRole("button", { name: "Leave Group" })).toBeVisible();

    // Rename.
    await page.getByLabel("Group name").fill("  ");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByText("Give the Group a name.")).toBeVisible();
    await page.getByLabel("Group name").fill("Difference Engine");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Difference Engine" })).toBeVisible();
    await expect(graces.getByRole("heading", { level: 1, name: "Difference Engine" })).toBeVisible();
    await expect(linuses.getByRole("heading", { level: 1, name: "Difference Engine" })).toBeVisible();

    // Add by email: refusals in place, then it works and everyone's list grows.
    const address = page.getByLabel("Add a person by email");
    await address.fill("nobody-at-all@example.com");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(NOBODY)).toBeVisible();
    await address.fill(ada.email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(summary(page, 4)).toBeVisible();
    await expect(participants(page).filter({ hasText: "Ada Lovelace" })).toBeVisible();
    await expect(summary(graces, 4)).toBeVisible();
    await address.fill(ada.email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("That person is already in this Group.")).toBeVisible();

    // Promote a member: they gain the controls, live.
    await page.getByRole("button", { name: "Promote Grace Hopper" }).click();
    await expect(participants(page).filter({ hasText: "Grace Hopper" })).toContainText("Admin");
    await expect(graces.getByLabel("Group name")).toBeVisible();
    await expect(graces.getByLabel("Add a person by email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Promote Grace Hopper" })).toHaveCount(0);

    // Remove a member: the list shrinks for the others, and for them the Conversation leaves their list.
    await page.getByRole("button", { name: "Remove Linus Torvalds" }).click();
    await expect(summary(page, 3)).toBeVisible();
    await expect(linuses.getByText("You are no longer part of this Conversation.")).toBeVisible();
    await showIndex(linuses);
    await expect(rowFor(linuses, group)).toHaveCount(0);
    await expect(summary(graces, 3)).toBeVisible();
  });

  test("a member can leave, which takes the Group out of their list; the last Admin leaving hands the Group to another member", async ({
    page,
    openSession,
  }) => {
    const { linus, group, graces } = await aGroup(page, openSession);

    // A member leaves: confirm first, then it leaves their list.
    await graces.getByRole("button", { name: "Leave Group" }).click();
    await expect(graces.getByText("Leave this Group?")).toBeVisible();
    await graces.getByRole("button", { name: "Cancel" }).click();
    await expect(graces.getByRole("button", { name: "Leave Group" })).toBeVisible();
    await graces.getByRole("button", { name: "Leave Group" }).click();
    await graces.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(graces).toHaveURL(/\/app$/);
    await expect(rowFor(graces, group)).toHaveCount(0);
    await expect(summary(page, 2)).toBeVisible();
    await expect(participants(page).filter({ hasText: "Grace Hopper" })).toHaveCount(0);

    // The only Admin leaves: told so first, and the backend makes the other member the Admin.
    await page.getByRole("button", { name: "Leave Group" }).click();
    await expect(page.getByText("You are its only Admin, so another member will become Admin.")).toBeVisible();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(rowFor(page, group)).toHaveCount(0);
    const remaining = await conversationVia(await signIn(linus.email), group);
    expect(remaining.participants, "only Linus is left").toHaveLength(1);
    expect(remaining.participants[0].userId).toBe(linus.id);
    expect(remaining.participants[0].role, "and he has been made Admin").toBe("ADMIN");
  });

  test("a refusal from the server shows in place, in plain words", async ({ page, openSession }) => {
    const { group } = await aGroup(page, openSession);
    await page.route(`**/conversations/${group}`, (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      return route.fulfill({
        status: 403,
        headers: {
          "content-type": "application/problem+json",
          "access-control-allow-origin": FRONTEND_URL,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({ title: "Forbidden", status: 403, detail: "Only group admins can do that." }),
      });
    });

    await page.getByLabel("Group name").fill("Another name");
    await page.getByRole("button", { name: "Rename" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Only an Admin can change this Group.");
    await expect(page.getByRole("heading", { level: 1, name: "Analytical Engine" })).toBeVisible();
  });
});
