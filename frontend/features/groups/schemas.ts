const LIMIT = 100;

/** Counted in code points, like the backend and the database check. */
const characters = (text: string) => [...text].length;

/** The backend's rules for a Group name (not blank, at most 100 characters, no NUL), checked before anything is sent. */
export function checkGroupName(text: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = text.trim();
  if (name.length === 0) return { ok: false, message: "Give the Group a name." };
  if (name.includes("\u0000")) return { ok: false, message: "Remove the special character from the name." };
  if (characters(name) > LIMIT) return { ok: false, message: `Use at most ${LIMIT} characters.` };
  return { ok: true, name };
}
