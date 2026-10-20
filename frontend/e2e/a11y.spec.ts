import { expect, test } from "./support/fixtures";
import { expectAccessible } from "./support/a11y";
import {
  createGroupVia,
  createVerifiedAccount,
  removeParticipantVia,
  sendMessageVia,
  signIn,
  startDirectVia,
} from "./support/backend";
import { codeFor, enterCode, signInThroughTheForm, signUpThroughTheForm, waitForForm } from "./support/auth-screens";
import { latestCodeFor } from "./support/mailpit";

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

  test("the views that confirm: address verified, password changed", async ({ page }) => {
    const account = await signUpThroughTheForm(page);
    await enterCode(page, await codeFor(account));
    await expect(page.getByRole("heading", { name: "Your address is verified" })).toBeVisible();
    await expectAccessible(page, "the verified view");

    const person = await createVerifiedAccount();
    await page.goto("/forgot-password");
    await waitForForm(page);
    await page.getByRole("main").getByLabel("Email address").fill(person.email);
    const asked = new Date();
    await page.getByRole("button", { name: "Send me a code" }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("Code from the email").fill(await latestCodeFor(person.email, 15_000, asked));
    await page.getByLabel("New password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: "Your password has been changed" })).toBeVisible();
    await expectAccessible(page, "the password-changed view");
  });

  test("a new Group's form with its errors, and a Conversation the person is no longer part of", async ({ page }) => {
    const [me, admin] = await Promise.all([createVerifiedAccount("Me Myself"), createVerifiedAccount("Ada Lovelace")]);
    const adminToken = await signIn(admin.email);
    const group = await createGroupVia(adminToken, "Analytical Engine", [me.id]);
    await signInThroughTheForm(page, me);

    await page.goto("/app/new/group");
    await expect(page.getByRole("heading", { level: 1, name: "New Group" })).toBeVisible();
    await waitForForm(page); // pressing before React has taken over would submit the form natively
    await page.getByRole("button", { name: "Create Group" }).click();
    await page.getByLabel("Add a person by email").fill("nobody-at-all@example.com");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Give the Group a name.")).toBeVisible();
    await expect(page.getByText(/No verified user has that email address/)).toBeVisible();
    await expectAccessible(page, "the new Group form with its errors");

    await page.goto(`/app/c/${group}`);
    await expect(page.getByRole("heading", { level: 1, name: "Analytical Engine" })).toBeVisible();
    await page.locator('[data-connection="connected"]').waitFor({ state: "attached" });
    await removeParticipantVia(adminToken, group, me.id);
    await expect(page.getByText("You are no longer part of this Conversation.")).toBeVisible();
    await expectAccessible(page, "a Conversation the person is no longer part of");
  });
});
