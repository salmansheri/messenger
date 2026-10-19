import { z } from "zod";

const LIMIT = 100;

/** Counted in code points, like the backend and the database check. */
const characters = (text: string) => [...text].length;

/** The backend's rules for a Group name: not blank, at most 100 characters, no NUL (which cannot be stored). */
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Give the Group a name.")
  .refine((name) => !name.includes("\u0000"), "Remove the special character from the name.")
  .refine((name) => characters(name) <= LIMIT, `Use at most ${LIMIT} characters.`);

/** The name checked before anything is sent: trimmed, or why it cannot be used. */
export function checkGroupName(text: string): { ok: true; name: string } | { ok: false; message: string } {
  const result = groupNameSchema.safeParse(text);
  return result.success ? { ok: true, name: result.data } : { ok: false, message: result.error.issues[0].message };
}
