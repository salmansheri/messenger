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

/** Starts a Direct conversation through the backend (as the owner of the token) and returns its id. */
export async function startDirectVia(token: string, userId: string): Promise<string> {
  const response = await post("/api/v1/conversations/direct", { userId }, token);
  if (response.status !== 200 && response.status !== 201) throw new Error(`Start direct failed: ${response.status}`);
  return ((await response.json()) as { id: string }).id;
}

/** Creates a Group through the backend and returns its id. */
export async function createGroupVia(token: string, name: string, userIds: string[]): Promise<string> {
  const response = await post("/api/v1/conversations/groups", { name, userIds }, token);
  if (response.status !== 201) throw new Error(`Create group failed: ${response.status}`);
  return ((await response.json()) as { id: string }).id;
}

/** Sends a Message through the backend. */
export async function sendMessageVia(token: string, conversationId: string, body: string) {
  const response = await post(
    `/api/v1/conversations/${conversationId}/messages`,
    { clientMessageId: crypto.randomUUID(), body },
    token,
  );
  if (response.status !== 201) throw new Error(`Send failed: ${response.status}`);
}

/** Asks the backend for a password reset code (the answer is the same whether or not the address has an account). */
export async function forgotPasswordVia(email: string): Promise<number> {
  return (await post("/api/v1/auth/forgot-password", { email })).status;
}

/** Every Message in a Conversation as the backend stores it (the newest page, up to 100). */
export async function messagesVia(token: string, conversationId: string): Promise<{ seq: number; body: string }[]> {
  const response = await fetch(`${BACKEND_URL}/api/v1/conversations/${conversationId}/messages?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status !== 200) throw new Error(`History failed: ${response.status}`);
  return ((await response.json()) as { messages: { seq: number; body: string }[] }).messages;
}

/** Reports that the caller has read up to a position (like opening the Conversation in another app would). */
export async function readUpToVia(token: string, conversationId: string, readSeq: number) {
  const response = await post(`/api/v1/conversations/${conversationId}/receipts`, { readSeq }, token);
  if (response.status !== 200) throw new Error(`Receipt failed: ${response.status}`);
}
