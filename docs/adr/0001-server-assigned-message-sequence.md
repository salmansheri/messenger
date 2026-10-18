# Messages are ordered by a server-assigned, per-conversation Sequence number

Every Message gets the next integer in its Conversation (`conversation.last_seq`, incremented under a row lock in the same transaction that stores the Message), and that number is the canonical order and the sync cursor (`afterSeq` / `beforeSeq`). We rejected ordering by client-generated UUIDv7s or timestamps, because client clocks disagree and can be wrong or hostile, and a Postgres sequence per Conversation, because it needs DDL on every new Conversation and still leaves gaps after rollbacks.

## Consequences

- Sends to one Conversation are serialised by the row lock; different Conversations never block each other. This caps per-Conversation write throughput, which is fine for chat.
- Sequence numbers have no gaps, so a client that sees seq N and N+2 knows N+1 is missing and can ask for it. Receipts (delivered/read cursors) and unread counts are plain integer arithmetic on the same numbers.
- The client still supplies a Client message ID, but only to make retries idempotent. It never decides order.
- Reordering, edits or deletions later must not reuse or renumber a Sequence number.
