import { BACKEND_URL } from "./playwright-urls";

/**
 * A backend that was already running keeps whatever throttles it started with. Sign-up and resend requests share a
 * per-IP allowance (20 an hour by default), so a long suite would fail with confusing 429s. Spend a little more than
 * that allowance up front and fail clearly if the backend refuses.
 */
export default async function globalSetup() {
  for (let i = 0; i < 25; i++) {
    const response = await fetch(`${BACKEND_URL}/api/v1/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `warm-up-${crypto.randomUUID()}@example.com` }),
    });
    if (response.status === 429) {
      throw new Error(
        "The backend is throttling sign-up emails at the default limits. Stop it and let Playwright start it " +
          "(it raises the limits), or start it with APP_OTP_MAX_SENDS_PER_HOUR, APP_OTP_MAX_SENDS_PER_IP_PER_HOUR, " +
          "APP_LOOKUP_MAX_PER_MINUTE and APP_GROUPS_MAX_CREATED_PER_HOUR set high (see playwright.config.ts).",
      );
    }
    if (response.status !== 204) throw new Error(`Unexpected ${response.status} from the backend during warm-up`);
  }
}
