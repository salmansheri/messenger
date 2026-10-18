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
export const problem = (page: Page) => page.locator("main").getByRole("alert");

/** The good-news message on the screen. */
export const info = (page: Page) => page.locator("main").getByRole("status");
