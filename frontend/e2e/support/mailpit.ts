import { MAILPIT_URL } from "../playwright-urls";

type Summary = { ID: string; Created: string; To: { Address: string }[] };

/** The newest email addressed to exactly this address, once it has arrived in Mailpit. */
async function latestEmailTo(email: string): Promise<{ Text: string } | null> {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = (await search.json()) as { messages: Summary[] };
  const newest = (messages ?? [])
    .filter((message) => message.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()))
    .sort((a, b) => b.Created.localeCompare(a.Created))[0];
  if (!newest) return null;
  const message = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
  return (await message.json()) as { Text: string };
}

/** Waits for an email to the address and returns the 6-digit Verification code in it. */
export async function latestCodeFor(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mail = await latestEmailTo(email);
    const code = mail?.Text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No Verification code arrived for ${email}`);
}
