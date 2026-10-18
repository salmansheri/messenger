import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";
import { createVerifiedAccount, signIn } from "./support/backend";

test.describe("test harness", () => {
  test("can create a verified account through the backend, reading its code from Mailpit", async () => {
    const account = await createVerifiedAccount("Grace Hopper");

    const token = await signIn(account.email);
    const me = await fetch(`${BACKEND_URL}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } });

    expect(me.status).toBe(200);
    expect(((await me.json()) as { displayName: string }).displayName).toBe("Grace Hopper");
  });

  test("the browser may call the backend with credentials from the frontend's origin", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(async (backend) => {
      const response = await fetch(`${backend}/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
      return { status: response.status, type: response.type };
    }, BACKEND_URL);

    // No cookie yet, so the backend answers 401 itself; a CORS failure would throw instead of answering.
    expect(result).toEqual({ status: 401, type: "cors" });
  });
});
