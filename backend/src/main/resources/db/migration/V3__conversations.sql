CREATE TABLE conversation (
    id         UUID PRIMARY KEY,
    type       VARCHAR(10)  NOT NULL CHECK (type IN ('DIRECT', 'GROUP')),
    name       VARCHAR(100),
    -- Both User ids, sorted and joined with ':'. Unique, so a pair of Users can only ever have one Direct conversation.
    direct_key VARCHAR(73) UNIQUE,
    -- The Sequence number of the latest Message; incremented in the same transaction that stores a Message.
    last_seq   BIGINT       NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL,
    -- Time of the latest activity; the Conversation list is ordered by it.
    updated_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT conversation_direct_key_matches_type CHECK ((type = 'DIRECT') = (direct_key IS NOT NULL))
);

CREATE INDEX conversation_updated_idx ON conversation (updated_at DESC, id DESC);

CREATE TABLE participant (
    id              UUID PRIMARY KEY,
    conversation_id UUID        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
    joined_at       TIMESTAMPTZ NOT NULL,
    UNIQUE (conversation_id, user_id)
);

CREATE INDEX participant_user_idx ON participant (user_id);
