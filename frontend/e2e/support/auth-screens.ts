import { expect, type Page } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./backend";
import { latestCodeFor } from "./mailpit";

export type NewAccount = { email: string; name: string; password: string };

export const newAccount = (name = "Ada Lovelace"): NewAccount => ({ email: uniqueEmail(), name, password: PASSWORD });

/** Fills in and submits the sign-up form. */
export async function fillSignUp(page: Page, account: NewAccount) {
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Your name").fill(account.name);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Signs up through the form and waits until the verification screen is showing. */
export async function signUpThroughTheForm(page: Page, account = newAccount()) {
  await page.goto("/sign-up");
  await fillSignUp(page, account);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  return account;
}

export async function enterCode(page: Page, code: string) {
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

export const codeFor = (account: NewAccount) => latestCodeFor(account.email);

/** A code that is certainly not the one that was sent. */
export const otherThan = (code: string) => (code === "000000" ? "111111" : "000000");

/** The problem message on the screen (not the framework's own route announcer, which is also an alert). */
export const problem = (page: Page) => page.getByRole("main").getByRole("alert");

/** The good-news message on the screen. */
export const info = (page: Page) => page.getByRole("main").getByRole("status");

/**
 * The email field on the verification screen. Next keeps the page you came from in the DOM (hidden) so Back restores
 * it, which makes a label query ambiguous; a role query only sees what is actually on screen.
 */
export const verifyEmailField = (page: Page) => page.getByRole("textbox", { name: "Email address" });

/** Signs in through the sign-in form and waits until the signed-in app is showing. */
export async function signInThroughTheForm(page: Page, account: { email: string; password: string }) {
  await page.goto("/sign-in");
  await submitSignIn(page, account);
  await expect(page).toHaveURL(/\/app$/);
}

/** Fills in and sends the sign-in form that is on screen. */
export async function submitSignIn(page: Page, account: { email: string; password: string }) {
  // Next keeps the page you came from in the DOM, hidden; the visible main region has exactly one of each field.
  const main = page.getByRole("main");
  await main.getByLabel("Email address").fill(account.email);
  await main.getByLabel("Password").fill(account.password);
  await main.getByRole("button", { name: "Sign in" }).click();
}
