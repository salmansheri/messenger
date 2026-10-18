import { MAILPIT_URL } from "../../playwright.config";

type Summary = { ID: string };

/** The newest email sent to the address, once it has arrived in Mailpit. */
async function latestEmailTo(email: string): Promise<{ Text: string } | null> {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const { messages } = (await search.json()) as { messages: Summary[] };
  if (!messages?.length) return null;
  const message = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
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
