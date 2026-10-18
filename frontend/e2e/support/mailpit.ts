import { MAILPIT_URL } from "../playwright-urls";

type Summary = { ID: string; Created: string; To: { Address: string }[] };

/** The newest email addressed to exactly this address (only one that arrived after `since`, if given). */
async function latestEmailTo(email: string, since?: Date): Promise<{ Text: string } | null> {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = (await search.json()) as { messages: Summary[] };
  const newest = (messages ?? [])
    .filter((message) => message.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()))
    .filter((message) => !since || Date.parse(message.Created) >= since.getTime())
    .sort((a, b) => b.Created.localeCompare(a.Created))[0];
  if (!newest) return null;
  const message = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
  return (await message.json()) as { Text: string };
}

/** How many emails Mailpit holds for exactly this address. */
export async function emailCountTo(email: string): Promise<number> {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = (await search.json()) as { messages: Summary[] };
  return (messages ?? []).filter((message) => message.To.some((to) => to.Address.toLowerCase() === email.toLowerCase())).length;
}

/**
 * Waits for an email to the address and returns the 6-digit code in it. Pass `since` (the moment just before the code
 * was asked for) when the address already has older emails with codes, so an old one is never mistaken for the new one.
 */
export async function latestCodeFor(email: string, timeoutMs = 15_000, since?: Date): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mail = await latestEmailTo(email, since);
    const code = mail?.Text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No Verification code arrived for ${email}`);
}
