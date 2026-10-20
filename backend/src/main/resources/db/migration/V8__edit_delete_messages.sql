-- Set when the sender changed the text after sending (earlier versions are not kept).
ALTER TABLE message ADD COLUMN edited_at TIMESTAMPTZ;

-- Set when the sender deleted the Message for everyone. The row stays, with its Sequence number, so ordering and
-- catch-up are unchanged (see docs/adr/0004); only the text is wiped.
ALTER TABLE message ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE message ALTER COLUMN body DROP NOT NULL;
ALTER TABLE message DROP CONSTRAINT message_body_check;
ALTER TABLE message ADD CONSTRAINT message_body_matches_deletion CHECK (
    (deleted_at IS NULL AND char_length(body) BETWEEN 1 AND 4000) OR (deleted_at IS NOT NULL AND body IS NULL));

-- "Delete for me": a Message a Participant hid from their own view. Nobody else can tell.
CREATE TABLE message_hidden (
    id              UUID PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    message_id      UUID        NOT NULL REFERENCES message (id) ON DELETE CASCADE,
    conversation_id UUID        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    hidden_at       TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, message_id)
);

CREATE INDEX message_hidden_user_conversation_idx ON message_hidden (user_id, conversation_id);
