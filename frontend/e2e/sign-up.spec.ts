import { expect, test } from "./support/fixtures";
import { createVerifiedAccount, signIn } from "./support/backend";
import { codeFor, enterCode, fillSignUp, info, newAccount, otherThan, problem, signUpThroughTheForm } from "./support/auth-screens";
import { latestCodeFor } from "./support/mailpit";

test.describe("sign up and verify", () => {
  test("a visitor signs up, enters the emailed code and ends up with a verified account", async ({ page }) => {
    const account = await signUpThroughTheForm(page);
    await expect(page).toHaveURL(new RegExp(`/verify\\?email=${encodeURIComponent(account.email).replace(/\./g, "\\.")}`));
    await expect(page.getByText(`We sent a 6-digit code to ${account.email}`)).toBeVisible();

    await enterCode(page, await codeFor(account));

    const heading = page.getByRole("heading", { name: "Your address is verified" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/sign-in");
    expect(await signIn(account.email, account.password), "the backend now accepts this account").toBeTruthy();
  });

  test("an address that is not an address, a missing name and a short password are caught before anything is sent", async ({
    page,
  }) => {
    const sent: string[] = [];
    page.on("request", (request) => request.url().includes("/auth/") && sent.push(request.url()));
    await page.goto("/sign-up");

    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expect(page.getByText("Enter the name others will see.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    const email = page.getByLabel("Email address");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("Enter your email address.");

    await email.fill("ada@");
    await expect(page.getByText("Enter a valid email address, like ada@example.com.")).toBeVisible();
    await page.getByLabel("Your name").fill("a".repeat(101));
    await page.getByLabel("Password").fill("é".repeat(37));
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at most 100 characters.")).toBeVisible();
    await expect(page.getByText(/Use at most 72 bytes/)).toBeVisible();
    expect(sent, "no request reached the backend").toEqual([]);
  });

  test("an address that already has an account is told so", async ({ page }) => {
    const existing = await createVerifiedAccount();
    await page.goto("/sign-up");

    await fillSignUp(page, { email: existing.email, name: "Someone Else", password: existing.password });

    await expect(problem(page)).toHaveText(
      "An account with this email already exists. Try signing in instead.",
    );
  });

  test("signing up again before verifying sends a fresh code that works", async ({ page }) => {
    const account = await signUpThroughTheForm(page);
    const first = await codeFor(account);

    await page.goto("/sign-up");
    await fillSignUp(page, account);
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect.poll(() => latestCodeFor(account.email)).not.toBe(first);

    await enterCode(page, await codeFor(account));
    await expect(page.getByRole("heading", { name: "Your address is verified" })).toBeVisible();
  });

  test("a wrong code is refused with a plain message and the right one still works", async ({ page }) => {
    const account = await signUpThroughTheForm(page);
    const code = await codeFor(account);

    await enterCode(page, otherThan(code));
    await expect(problem(page)).toHaveText("That code is wrong or has expired. Check it, or ask for a new one.");
    await enterCode(page, "12ab");
    await expect(page.getByText("Enter the 6-digit code from the email.")).toBeVisible();

    await enterCode(page, code);
    await expect(page.getByRole("heading", { name: "Your address is verified" })).toBeVisible();
  });

  test("after too many wrong tries the code is dead until a new one is requested", async ({ page }) => {
    const account = await signUpThroughTheForm(page);
    const code = await codeFor(account);

    for (let attempt = 0; attempt < 5; attempt++) await enterCode(page, otherThan(code));
    await expect(problem(page)).toHaveText("Too many wrong tries. This code no longer works: ask for a new one.");

    await enterCode(page, code); // even the right code is refused now
    await expect(problem(page)).toContainText("no longer works");
    await expect(page.getByRole("heading", { name: "Your address is verified" })).toBeHidden();

    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect(info(page)).toContainText(`A new code is on its way to ${account.email}`);
    await expect(page.getByLabel("Verification code"), "the dead code is cleared away").toHaveValue("");
    await expect.poll(() => latestCodeFor(account.email)).not.toBe(code);
    await enterCode(page, await codeFor(account));
    await expect(page.getByRole("heading", { name: "Your address is verified" })).toBeVisible();
  });

  test("asking for a new code replaces the old one", async ({ page }) => {
    const account = await signUpThroughTheForm(page);
    const oldCode = await codeFor(account);

    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect(info(page)).toContainText("A new code is on its way");
    await expect.poll(() => latestCodeFor(account.email)).not.toBe(oldCode);

    await enterCode(page, oldCode);
    await expect(problem(page)).toContainText("wrong or has expired");
    await enterCode(page, await codeFor(account));
    await expect(page.getByRole("heading", { name: "Your address is verified" })).toBeVisible();
  });

  test("asking for too many codes shows when to try again", async ({ page }) => {
    const account = await signUpThroughTheForm(page); // the first of the five codes an address may have per hour
    const resend = page.getByRole("button", { name: "Send a new code" });

    for (let request = 0; request < 4; request++) {
      const answered = page.waitForResponse((response) => response.url().includes("/resend-verification"));
      await resend.click();
      expect((await answered).status()).toBe(204);
    }
    const refused = page.waitForResponse((response) => response.url().includes("/resend-verification"));
    await resend.click();

    expect((await refused).status()).toBe(429);
    await expect(problem(page)).toHaveText(/^Too many codes were requested\. Try again in (\d+ minutes?|\d+ hours?)\.$/);
    expect(account.email).toBeTruthy();
  });

  test("the verification screen can be used cold, and an unknown address gets the same answer as a wrong code", async ({
    page,
  }) => {
    await page.goto("/verify");
    await expect(page.getByText("Enter the address you signed up with")).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue("");

    await page.getByLabel("Email address").fill("nobody-here@example.com");
    await enterCode(page, "123456");

    await expect(problem(page)).toHaveText("That code is wrong or has expired. Check it, or ask for a new one.");
  });

  test("a dropped connection is explained and the same form can simply be sent again", async ({ page }) => {
    await page.route("**/api/v1/auth/signup", (route) => route.abort());
    await page.goto("/sign-up");
    const account = newAccount();

    await fillSignUp(page, account);
    await expect(problem(page)).toHaveText("Could not reach the server. Check your connection and try again.");

    await page.unroute("**/api/v1/auth/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });
});
