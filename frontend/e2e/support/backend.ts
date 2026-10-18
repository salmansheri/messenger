import { BACKEND_URL } from "../playwright-urls";
import { latestCodeFor } from "./mailpit";

export const PASSWORD = "correct-horse-battery";

export type Account = { email: string; displayName: string; password: string; id: string };

export function uniqueEmail() {
  return `e2e-${crypto.randomUUID()}@example.com`;
}

async function post(path: string, body: unknown, token?: string) {
  return fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

/** Signs up and verifies a fresh account straight through the backend (the browser is not involved). */
export async function createVerifiedAccount(displayName = "Ada Lovelace"): Promise<Account> {
  const email = uniqueEmail();
  const signUp = await post("/api/v1/auth/signup", { email, displayName, password: PASSWORD });
  if (signUp.status !== 202) throw new Error(`Sign up failed: ${signUp.status}`);
  const code = await latestCodeFor(email);
  const verify = await post("/api/v1/auth/verify-email", { email, code });
  if (verify.status !== 204) throw new Error(`Verification failed: ${verify.status}`);
  const login = await signIn(email);
  const me = await fetch(`${BACKEND_URL}/api/v1/users/me`, { headers: { Authorization: `Bearer ${login}` } });
  const { id } = (await me.json()) as { id: string };
  return { email, displayName, password: PASSWORD, id };
}

/** Signs up through the backend and stops there: the address is never verified. */
export async function createUnverifiedAccount(displayName = "Grace Hopper") {
  const email = uniqueEmail();
  const signUp = await post("/api/v1/auth/signup", { email, displayName, password: PASSWORD });
  if (signUp.status !== 202) throw new Error(`Sign up failed: ${signUp.status}`);
  return { email, displayName, password: PASSWORD };
}

/** Signs in through the backend and returns an access token. */
export async function signIn(email: string, password = PASSWORD): Promise<string> {
  const login = await post("/api/v1/auth/login", { email, password });
  if (login.status !== 200) throw new Error(`Sign in failed: ${login.status}`);
  return ((await login.json()) as { accessToken: string }).accessToken;
}
