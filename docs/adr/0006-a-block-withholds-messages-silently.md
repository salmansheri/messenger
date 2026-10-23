# A Block withholds Messages silently

When a User blocks someone, the Blocked User is never told. Their Messages in the Direct conversation are still accepted (201, stored with the next Sequence number, shown to them as sent) but become Withheld Messages: they never reach the blocker, live or by fetch, and stay withheld after Unblock. We rejected refusing the send ("You can't send Messages to this person"), because telling someone they are blocked invites them to try another way and can escalate harassment; refusing would also be the simpler path to build, which is why this is written down. We rejected deleting or not storing the Messages, because ADR 0001's gap-free numbering would break for the sender, whose history must stay whole and consistent with their retries.

## Consequences

- A Withheld Message stays **Sent** for ever, before and after Unblock: the status rule (the lowest position among the others) has an exception for it, because the blocker's positions moving past it later would otherwise reveal the Block as Delivered or Read.
- The blocker's unread count leaves Withheld Messages out. This is an exception to the plain Sequence arithmetic chosen in #28, which still applies to Messages someone hid for themselves.
- For the blocker, Withheld Messages are not activity: they do not move the Conversation up the list, push nothing, and are absent from history, catch-up, `lastMessage`, search and quotes, exactly like a Message they hid themselves.
- Withheld Messages accumulate in the database with no reader but their sender. That is the price of silence.
- What cannot be withheld is written down as a limit: an edit to a Message sent shortly before the Block (the 15-minute edit window) shows to the blocker at their next fetch, because the server keeps no earlier text (ADR 0004).
- Silence is not perfect: the Blocked User sees no presence for the blocker, and lookup by email still finds them while adding them to a Group is refused. The Block is meant to stop contact, not to be undetectable.
