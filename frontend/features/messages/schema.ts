import { z } from "zod";

const LIMIT = 4000;

/** Counted in code points, like the backend and the database check (an emoji is one character, not two). */
const characters = (text: string) => [...text].length;

const bodySchema = z.string().superRefine((text, ctx) => {
  if (text.trim().length === 0) {
    ctx.addIssue({ code: "custom", message: "Write something to send." });
  } else if (text.includes("\u0000")) {
    ctx.addIssue({
      code: "custom",
      message: "This Message contains a character that cannot be sent. Remove it and try again.",
    });
  } else if (characters(text.trim()) > LIMIT) {
    ctx.addIssue({
      code: "custom",
      message: `This Message has ${characters(text.trim()).toLocaleString("en-US")} characters; the limit is ${LIMIT.toLocaleString("en-US")}.`,
    });
  }
});

/** The backend's rules for a Message body (not blank, at most 4000 characters, no NUL), checked before anything is sent. */
export function checkMessageBody(text: string): { ok: true; body: string } | { ok: false; message: string } {
  const result = bodySchema.safeParse(text);
  return result.success ? { ok: true, body: text.trim() } : { ok: false, message: result.error.issues[0].message };
}
