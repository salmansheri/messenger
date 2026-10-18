CREATE TABLE message (
    id                UUID PRIMARY KEY,
    conversation_id   UUID        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    -- Position in the Conversation, assigned by the server from conversation.last_seq. Gap-free and the canonical order.
    seq               BIGINT      NOT NULL,
    sender_id         UUID        NOT NULL REFERENCES users (id),
    -- Chosen by the sending client so a retried send is recognised and not stored twice.
    client_message_id UUID        NOT NULL,
    body              TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at        TIMESTAMPTZ NOT NULL,
    UNIQUE (conversation_id, seq),
    UNIQUE (conversation_id, sender_id, client_message_id)
);
