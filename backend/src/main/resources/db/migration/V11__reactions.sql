-- One reaction per Participant per Message, from a fixed set of six. A reaction is deleted when its Participant
-- leaves or is removed, so nobody who is gone is counted and coming back starts fresh.
CREATE TABLE reaction (
    id              UUID PRIMARY KEY,
    message_id      UUID        NOT NULL REFERENCES message (id) ON DELETE CASCADE,
    conversation_id UUID        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emoji           VARCHAR(16) NOT NULL CHECK (emoji IN (U&'\+01F44D', U&'\2764\FE0F', U&'\+01F602', U&'\+01F62E', U&'\+01F622', U&'\+01F64F')),
    created_at      TIMESTAMPTZ NOT NULL,
    UNIQUE (message_id, user_id)
);

CREATE INDEX reaction_conversation_user_idx ON reaction (conversation_id, user_id);
