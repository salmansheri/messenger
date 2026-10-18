# Realtime events cross server instances through a RabbitMQ fanout, not a STOMP broker relay

Clients speak STOMP over WebSocket, but each server instance delivers to its own sockets through Spring's in-memory broker, and RabbitMQ carries events between instances over the AMQP connection the app already uses: one fanout exchange (`messenger.events`) and one private auto-deleted queue per instance. We first planned a STOMP broker relay, but that needs RabbitMQ's STOMP plugin, a second fixed port wired into dev and tests, and extra machinery to reach a user whose session is on another instance; the fanout needs none of that and is fully testable.

Events are addressed to users, not to conversations: the publisher decides the recipients from the conversation's current participants at the moment of the change and puts them in the event, so a removed participant stops receiving events without any subscription to tear down, and clients never subscribe to a conversation at all (only to their own `/user/queue/events` and `/user/queue/errors`).

## Consequences

- Every instance receives every event and drops the ones for users not connected to it. Fine for a few instances; if traffic grows, partition by user or switch to a real relay.
- The publisher is behind `RealtimePublisher`, so moving to a broker relay later touches one class.
- An event carries its recipient list, so a very large group makes a larger message (at most 256 ids).
- Delivery is best effort and not durable: an instance restarting, or RabbitMQ reconnecting, misses events. Clients
  must fetch the conversation list and catch up with `afterSeq` after every reconnect.
- Events can arrive in a different order than they happened (they are published after commit, once the conversation
  lock is released). Clients order messages by `seq` and treat `receipts.updated` values as only ever increasing.
- Local delivery also goes through RabbitMQ, so a RabbitMQ outage stops realtime even on a single instance; REST keeps
  working.
- A control event (`auth.revoked`) travels the same way to close a user's sockets on every instance (password reset).

