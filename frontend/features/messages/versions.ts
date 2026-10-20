import type { MessageResponse } from "@/lib/api";

const at = (iso: string | undefined) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

/**
 * Whether `incoming` is a later version of the same Message than `known`. Events are best effort and can arrive late
 * or twice, so an old edit must never replace a newer one, and nothing may bring a deleted Message's text back: a
 * deletion beats everything, and a Message already deleted stays as it is.
 */
export function isNewerVersion(known: MessageResponse, incoming: MessageResponse): boolean {
  if (known.deletedAt) return false;
  if (incoming.deletedAt) return true;
  return at(incoming.editedAt) > at(known.editedAt);
}

/**
 * The Message to show once `incoming` has been heard: `incoming` when it is newer, with the sender's own status kept
 * (an event never carries it), otherwise the very same `known` object so callers can tell nothing changed.
 */
export function mergeVersion(known: MessageResponse, incoming: MessageResponse): MessageResponse {
  return isNewerVersion(known, incoming) ? { ...incoming, status: incoming.status ?? known.status } : known;
}
