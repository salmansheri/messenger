/** The kinds of image the server accepts (it decides by looking inside the file; this only saves a pointless upload). */
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** For an `<input type=file accept>`. */
export const ACCEPT = ACCEPTED_TYPES.join(",");

/** The server refuses anything larger. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const NOT_AN_IMAGE = "Choose a PNG, JPEG, WebP or GIF image.";

/** What was found in a set of files the person pasted, dropped or picked. */
export type ChosenFile = { kind: "none" } | { kind: "image"; file: File } | { kind: "refused"; message: string };

/** Whether one file may be uploaded, and if not, why, before anything is sent. */
export function checkImageFile(file: Pick<File, "type" | "size">): { ok: true } | { ok: false; message: string } {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: NOT_AN_IMAGE };
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: "That image is larger than 10 MB." };
  return { ok: true };
}

/**
 * The image among files that were pasted, dropped or picked: the first file is the one used (several images are
 * several Messages). No files at all is `none`, so pasting plain text is left to the browser; files that are not an
 * allowed image are refused with the reason.
 */
export function chooseImage(files: ArrayLike<File> | null | undefined): ChosenFile {
  const first = files?.[0];
  if (!first) return { kind: "none" };
  const checked = checkImageFile(first);
  return checked.ok ? { kind: "image", file: first } : { kind: "refused", message: checked.message };
}
