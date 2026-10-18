import { BACKEND_URL } from "./playwright-urls";
import { expect, test } from "./support/fixtures";
import { createUnverifiedAccount, createVerifiedAccount, PASSWORD, uniqueEmail } from "./support/backend";
import { problem, signInThroughTheForm, submitSignIn, verifyEmailField } from "./support/auth-screens";

const MINUTE = 60_000;

test.describe("signing in and out", () => {
  test("a verified account signs in and lands in the app", async ({ page }) => {
    const account = await createVerifiedAccount();

    await signInThroughTheForm(page, account);

    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  });

  test("a wrong password and an unknown address get exactly the same answer", async ({ page }) => {
    const account = await createVerifiedAccount();
    await page.goto("/sign-in");

    await submitSignIn(page, { email: account.email, password: "not-the-password" });
    await expect(problem(page)).toContainText("do not match");
    const wrongPassword = await problem(page).textContent();

    await submitSignIn(page, { email: uniqueEmail(), password: PASSWORD });
    await expect(problem(page)).toContainText("do not match");

    expect(await problem(page).textContent()).toBe(wrongPassword);
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("the sign-in form checks what it can before asking the server", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeFocused();
  });

  test("an account that was never verified is sent to the verification screen", async ({ page }) => {
    const account = await createUnverifiedAccount();
    await page.goto("/sign-in");

    await submitSignIn(page, account);

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(verifyEmailField(page)).toHaveValue(account.email);
  });

  test("the whole first-time journey works: sign up, verify, continue to sign in, land in the app", async ({
    page,
  }) => {
    const { signUpThroughTheForm, enterCode, codeFor, newAccount } = await import("./support/auth-screens");
    const account = newAccount();
    await signUpThroughTheForm(page, account);
    await enterCode(page, await codeFor(account));

    await page.getByRole("link", { name: "Continue to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await submitSignIn(page, account);

    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe("the session", () => {
  test("survives a reload through the refresh cookie, with no token in any browser storage, and asks for it once", async ({
    page,
    context,
  }) => {
    const account = await createVerifiedAccount();
    await signInThroughTheForm(page, account);
    await page.goto("/app/settings");
    await expect(page.getByText(account.displayName)).toBeVisible();

    const refreshes: string[] = [];
    page.on("request", (request) => request.method() === "POST" && request.url().endsWith("/auth/refresh") && refreshes.push(request.url()));
    await page.reload();

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText(account.displayName)).toBeVisible();
    expect(refreshes, "everything on the page shared one refresh").toHaveLength(1);

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, cookie: document.cookie }));
    expect(stored).not.toMatch(/eyJ/); // every JWT starts like this
    expect(stored).not.toContain("refresh_token");
    const cookies = await context.cookies(`${BACKEND_URL}/api/v1/auth`);
    expect(cookies.find((c) => c.name === "refresh_token")?.httpOnly, "the refresh cookie exists and scripts cannot read it").toBe(true);
  });

  test("renews itself before the 15-minute token runs out", async ({ page }) => {
    const account = await createVerifiedAccount();
    await page.clock.install();
    await signInThroughTheForm(page, account);
    const renewed = page.waitForResponse((r) => r.url().endsWith("/auth/refresh") && r.request().method() === "POST");

    await page.clock.fastForward(14 * MINUTE + 5_000);

    expect((await renewed).status()).toBe(200);
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText(account.displayName)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/settings$/);
  });

  test("when it can no longer be renewed, the person lands on sign-in with an explanation and can carry on from there", async ({
    page,
    context,
  }) => {
    const account = await createVerifiedAccount();
    await page.clock.install();
    await signInThroughTheForm(page, account);
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    // The session is ended on the server (as a password reset would), so the next renewal is refused.
    expect((await context.request.post(`${BACKEND_URL}/api/v1/auth/logout`)).status()).toBe(204);

    await page.clock.fastForward(14 * MINUTE + 5_000);

    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings$/);
    await expect(page.getByText("Your session ended")).toBeVisible();
    await submitSignIn(page, account);
    await expect(page).toHaveURL(/\/app\/settings$/);
  });
});

test.describe("guards", () => {
  test("a signed-in page sends a visitor to sign-in and brings them back afterwards", async ({ page }) => {
    const account = await createVerifiedAccount();

    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings$/);
    await expect(page.getByText("Your session ended")).toBeHidden();
    await submitSignIn(page, account);

    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("a crafted return address cannot send a freshly signed-in person to another site", async ({ page }) => {
    const account = await createVerifiedAccount();
    await page.goto("/sign-in?next=https%3A%2F%2Fevil.example%2Fapp");

    await submitSignIn(page, account);

    await expect(page).toHaveURL(/\/app$/);
    expect(new URL(page.url()).host).toBe(new URL(page.context().pages()[0].url()).host);
    expect(page.url()).not.toContain("evil.example");
  });

  test("someone who is already signed in is taken away from sign-in and sign-up", async ({ page }) => {
    const account = await createVerifiedAccount();
    await signInThroughTheForm(page, account);

    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe("settings and signing out", () => {
  test("settings shows who is signed in", async ({ page }) => {
    const account = await createVerifiedAccount("Grace Hopper");
    await signInThroughTheForm(page, account);

    await page.getByRole("link", { name: "Settings" }).click();

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Grace Hopper")).toBeVisible();
    await expect(page.getByText(account.email)).toBeVisible();
  });

  test("signing out ends the session: the cookie is gone and a reload stays signed out", async ({ page, context }) => {
    const account = await createVerifiedAccount();
    await signInThroughTheForm(page, account);
    await page.goto("/app/settings");
    expect((await context.cookies(`${BACKEND_URL}/api/v1/auth`)).some((c) => c.name === "refresh_token")).toBe(true);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText("Your session ended"), "leaving on purpose is not an unexpected end").toBeHidden();
    expect((await context.cookies(`${BACKEND_URL}/api/v1/auth`)).some((c) => c.name === "refresh_token")).toBe(false);
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings$/);
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings$/);
  });

  test("after signing out on purpose, signing in again starts at the app, not the page that was left", async ({
    page,
  }) => {
    const account = await createVerifiedAccount();
    await signInThroughTheForm(page, account);
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await submitSignIn(page, account);

    await expect(page).toHaveURL(/\/app$/);
  });

  test("if signing out fails the person is told and stays signed in", async ({ page }) => {
    const account = await createVerifiedAccount();
    await signInThroughTheForm(page, account);
    await page.goto("/app/settings");
    await page.route("**/api/v1/auth/logout", (route) => route.abort());

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(problem(page)).toContainText("Could not sign you out");
    await expect(problem(page)).toContainText("still signed in");
    await expect(page).toHaveURL(/\/app\/settings$/);
  });
});
