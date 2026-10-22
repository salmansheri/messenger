/**
 * Scrolls to and focuses the row of the loaded Message with this Sequence number, if it is on screen. A search result
 * that the address already opens at changes no address, so the Message view would not move: this does it instead.
 */
export function focusMessageRow(seq: number) {
  const row = document.querySelector<HTMLElement>(`[data-message-seq="${seq}"]`);
  row?.scrollIntoView({ block: "center" });
  row?.focus({ preventScroll: true });
}
