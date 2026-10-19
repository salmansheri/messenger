import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import { createGroupVia, createVerifiedAccount, sendMessageVia, signIn, startDirectVia } from "./support/backend";
import { signInThroughTheForm, waitForForm } from "./support/auth-screens";

test.describe("accessibility and wording, on every screen (the project decides the theme and the width)", () => {
  test("the screens a visitor sees, with and without their error messages", async ({ page }) => {
    for (const [path, heading] of [
      ["/", /./],
      ["/sign-in", "Sign in"],
      ["/sign-up", "Create your account"],
      ["/forgot-password", "Forgot your password?"],
      ["/verify", "Check your email"],
      ["/reset-password", "Choose a new password"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      if (heading instanceof RegExp) await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(heading);
      else await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expectAccessible(page, path);
    }

    // The same forms with every message they can show.
    await page.goto("/sign-up");
    await waitForForm(page);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expectAccessible(page, "/sign-up with its errors");

    await page.goto("/sign-in");
    await waitForForm(page);
    await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expectAccessible(page, "/sign-in with its errors");
  });

  test("a new person's empty list", async ({ page }) => {
    await signInThroughTheForm(page, await createVerifiedAccount());
    await expect(page.getByText("You have no Conversations yet.")).toBeVisible();
    await expectAccessible(page, "/app (empty)");
  });

  test("the signed-in screens: list, Direct conversation, Group with its panel, new, new Group, settings, not found", async ({
    page,
  }) => {
    const [me, grace, ada] = await Promise.all([
      createVerifiedAccount("Me Myself"),
      createVerifiedAccount("Grace Hopper"),
      createVerifiedAccount("Ada Lovelace"),
    ]);
    const [myToken, graceToken] = await Promise.all([signIn(me.email), signIn(grace.email)]);
    const direct = await startDirectVia(graceToken, me.id);
    await sendMessageVia(graceToken, direct, "Are you free\nat nine?");
    await sendMessageVia(graceToken, direct, "https://example.com/a/very/long/link/that/should/wrap/instead/of/breaking/the/page");
    await sendMessageVia(myToken, direct, "Yes, see you then");
    const group = await createGroupVia(myToken, "Analytical Engine", [grace.id, ada.id]);
    await sendMessageVia(graceToken, group, "Welcome, everyone");
    await signInThroughTheForm(page, me);

    await expect(page.getByRole("navigation", { name: "Conversations" }).getByRole("listitem")).toHaveCount(2);
    await expectAccessible(page, "/app (list)");

    await page.goto("/app/new");
    await expect(page.getByRole("heading", { level: 1, name: "Start a Conversation" })).toBeVisible();
    await expectAccessible(page, "/app/new");

    await page.goto("/app/new/group");
    await expect(page.getByRole("heading", { level: 1, name: "New Group" })).toBeVisible();
    await page.getByLabel("Add a person by email").fill(grace.email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("list", { name: "People in this Group" })).toBeVisible();
    await expectAccessible(page, "/app/new/group (with a person added)");

    await page.goto(`/app/c/${direct}`);
    await expect(page.getByRole("list", { name: "Messages" }).getByText("Yes, see you then")).toBeVisible();
    await expectAccessible(page, "a Direct conversation");

    await page.goto(`/app/c/${group}`);
    await expect(page.getByRole("list", { name: "Messages" }).getByText("Welcome, everyone")).toBeVisible();
    await page.getByText("Participants (3)").click();
    await expect(page.getByRole("list", { name: "Participants" })).toBeVisible();
    await expectAccessible(page, "a Group with its panel open");
    await page.getByRole("button", { name: "Leave Group" }).click();
    await expect(page.getByText("Leave this Group?")).toBeVisible();
    await expectAccessible(page, "a Group with the leave question");

    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByText("Me Myself").first()).toBeVisible();
    await expectAccessible(page, "/app/settings");

    await page.goto(`/app/c/${crypto.randomUUID()}`);
    await expect(page.getByText("This Conversation was not found.")).toBeVisible();
    await expectAccessible(page, "a Conversation that is not found");
  });
});
