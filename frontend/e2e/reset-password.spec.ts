import { expect, test } from "./support/fixtures";
import { createVerifiedAccount, forgotPasswordVia, PASSWORD, signIn, uniqueEmail } from "./support/backend";
import { BACKEND_URL } from "./playwright-urls";
import { problem, info, signInThroughTheForm, submitSignIn, verifyEmailField } from "./support/auth-screens";
import { emailCountTo, latestCodeFor } from "./support/mailpit";

const NEW_PASSWORD = "a-brand-new-password";
const MINUTE = 60_000;
const NEUTRAL = "If that address has an account, we have emailed a 6-digit code.";

test.describe("forgot and reset password", () => {
  test("a person who forgot their password asks for a code, chooses a new password and signs in with it", async ({
    page,
  }) => {
    const account = await createVerifiedAccount();
    await page.goto("/sign-in");

    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByRole("main").getByLabel("Email address").fill(account.email);
    const asked = new Date();
    await page.getByRole("button", { name: "Send me a code" }).click();

    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(verifyEmailField(page), "the address is carried over").toHaveValue(account.email);
    await expect(page.getByText(NEUTRAL)).toBeVisible();
    await page.getByLabel("Code from the email").fill(await latestCodeFor(account.email, 15_000, asked));
    await page.getByLabel("New password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();

    const heading = page.getByRole("heading", { name: "Your password has been changed" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await submitSignIn(page, { email: account.email, password: PASSWORD });
    await expect(problem(page), "the old password no longer works").toContainText("do not match");
    await submitSignIn(page, { email: account.email, password: NEW_PASSWORD });
    await expect(page).toHaveURL(/\/app$/);
  });

  test("resetting the password in a tab that is signed in ends that tab's session too", async ({ page }) => {
    const account = await createVerifiedAccount();
    await signInThroughTheForm(page, account);
    await page.goto("/forgot-password");
    const asked = new Date();
    await page.getByRole("main").getByLabel("Email address").fill(account.email);
    await page.getByRole("button", { name: "Send me a code" }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("Code from the email").fill(await latestCodeFor(account.email, 15_000, asked));
    await page.getByLabel("New password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: "Your password has been changed" })).toBeVisible();

    // The backend ended every session, this one included, so "Sign in" must really be a sign-in page.
    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await submitSignIn(page, { email: account.email, password: NEW_PASSWORD });
    await expect(page).toHaveURL(/\/app$/);
  });

  test("gives the same answer for an address with an account and one without, and only emails the first", async ({
    page,
  }) => {
    const account = await createVerifiedAccount();
    const stranger = uniqueEmail();

    const asked = new Date();
    // The stranger first: if an email were wrongly sent to them it would arrive before the known account's.
    for (const email of [stranger, account.email]) {
      await page.goto("/forgot-password");
      await page.getByRole("main").getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send me a code" }).click();
      await expect(page).toHaveURL(/\/reset-password$/);
      await expect(page.getByText(NEUTRAL)).toBeVisible();
      await expect(problem(page)).toBeHidden();
    }

    expect(await latestCodeFor(account.email, 15_000, asked), "the known account got its code").toMatch(/^\d{6}$/);
    expect(await emailCountTo(stranger), "no email goes to an address without an account").toBe(0);
  });

  test("a wrong code is refused, the code dies after five wrong tries, and a new code works", async ({ page }) => {
    const account = await createVerifiedAccount();
    const asked = new Date();
    await forgotPasswordVia(account.email);
    const code = await latestCodeFor(account.email, 15_000, asked);
    const wrong = code === "000000" ? "111111" : "000000";
    await page.goto("/reset-password");
    await expect(verifyEmailField(page)).toHaveValue("");
    await expect(page.getByText("Enter the 6-digit code from your email"), "no code was asked for here").toBeVisible();
    await expect(page.getByText(NEUTRAL)).toBeHidden();
    await verifyEmailField(page).fill(account.email);
    await page.getByLabel("New password").fill(NEW_PASSWORD);

    await page.getByLabel("Code from the email").fill(wrong);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(problem(page)).toHaveText("That code is wrong or has expired. Check it, or ask for a new one.");
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.getByRole("button", { name: "Change password" }).click();
    }
    await expect(problem(page)).toContainText("stops working after 5 wrong tries");
    await page.getByLabel("Code from the email").fill(code); // even the right code is refused now
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(problem(page)).toContainText("stops working after 5 wrong tries");

    const askedAgain = new Date();
    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect(info(page)).toContainText("If that address has an account, a new code is on its way");
    await expect(page.getByLabel("Code from the email"), "the dead code is cleared away").toHaveValue("");
    await page.getByLabel("Code from the email").fill(await latestCodeFor(account.email, 15_000, askedAgain));
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: "Your password has been changed" })).toBeVisible();
  });

  test("a weak password or a short code is caught before anything is sent", async ({ page }) => {
    await page.goto("/reset-password");
    const sent: string[] = [];
    page.on("request", (request) => request.url().includes("/auth/reset-password") && sent.push(request.url()));

    await verifyEmailField(page).fill("ada@example.com");
    await page.getByLabel("Code from the email").fill("12");
    await page.getByLabel("New password").fill("short");
    await page.getByRole("button", { name: "Change password" }).click();

    await expect(page.getByText("Enter the 6-digit code from the email.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByLabel("Code from the email"), "focus goes to the first mistake").toBeFocused();
    await page.getByLabel("New password").fill("é".repeat(37));
    await expect(page.getByText(/Use at most 72 bytes/)).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("asking for too many codes shows when to try again", async ({ page }) => {
    const email = uniqueEmail();
    for (let request = 0; request < 5; request++) expect(await forgotPasswordVia(email)).toBe(204);
    await page.goto("/forgot-password");

    await page.getByRole("main").getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send me a code" }).click();

    await expect(problem(page)).toHaveText(
      /^Too many codes were requested\. Try again in (\d+ minutes?|\d+ hours?)\.$/,
    );
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("a session open in another browser is ended: its next renewal fails and it lands on sign-in", async ({
    page,
    openSession,
  }) => {
    const account = await createVerifiedAccount();
    await page.clock.install();
    await signInThroughTheForm(page, account);
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // Another browser (a second context with its own cookies) resets the password through the screens.
    const elsewhere = await openSession();
    await elsewhere.goto("/forgot-password");
    const asked = new Date();
    await elsewhere.getByRole("main").getByLabel("Email address").fill(account.email);
    await elsewhere.getByRole("button", { name: "Send me a code" }).click();
    await expect(elsewhere).toHaveURL(/\/reset-password$/);
    await elsewhere.getByLabel("Code from the email").fill(await latestCodeFor(account.email, 15_000, asked));
    await elsewhere.getByLabel("New password").fill(NEW_PASSWORD);
    await elsewhere.getByRole("button", { name: "Change password" }).click();
    await expect(elsewhere.getByRole("heading", { name: "Your password has been changed" })).toBeVisible();

    // The reset is what ended the first browser's session: its refresh cookie is already refused by the backend.
    expect((await page.context().request.post(`${BACKEND_URL}/api/v1/auth/refresh`)).status()).toBe(401);
    await expect(signIn(account.email, PASSWORD), "the old password no longer works").rejects.toThrow();

    await page.clock.fastForward(14 * MINUTE + 5_000);

    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings$/);
    await expect(page.getByText("Your session ended")).toBeVisible();
    await submitSignIn(page, { email: account.email, password: NEW_PASSWORD });
    await expect(page).toHaveURL(/\/app\/settings$/);
  });
});
