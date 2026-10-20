# A Message deleted for everyone keeps its row and Sequence number

Deleting a Message for everyone does not remove its row. The text is wiped (the column becomes null and a check constraint ties that to `deleted_at`), but the Message stays in the Conversation with its Sequence number, sender and time, and clients show a "This Message was deleted" placeholder in its place. We rejected deleting the row, because ADR 0001's gap-free numbering would break: a client that sees seq N and N+2 treats N+1 as missing and fetches it, and receipts, unread counts and `afterSeq` catch-up are all arithmetic on those numbers. We also rejected renumbering later Messages, which the ADR already rules out.

## Consequences

- A placeholder still counts toward unread counts and moves nothing else; it appears in history, paging, catch-up and the Conversation list's last-message line like any other Message, minus its text.
- Wiping the text is the privacy guarantee: nothing the server returns, and no stored column, holds the deleted text. Edits keep no earlier version either (only an `edited_at` mark), so there is nothing else to purge.
- "Delete for me" is a different thing: a per-viewer record (`message_hidden`) that filters one person's view and leaves the Message intact for everyone else. It is filtered in the history queries, not afterwards, so a page stays full.
- Anything that quotes or previews a Message (replies, push) must handle a Message with no text.
- A retry of the send of an edited or deleted Message is answered with the stored Message (200), because the original text is no longer there to compare with.
