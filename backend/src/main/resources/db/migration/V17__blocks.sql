-- A Block (GLOSSARY, ADR 0006): one User's private decision to stop another reaching them. One row per pair, one way:
-- Ada blocking Grace says nothing about Grace blocking Ada. Lifting the Block deletes the row.
CREATE TABLE user_block (
    id         UUID        PRIMARY KEY,
    blocker_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    blocked_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT user_block_pair UNIQUE (blocker_id, blocked_id),
    CONSTRAINT user_block_not_self CHECK (blocker_id <> blocked_id)
);

-- "Who blocks this User?", for the checks made on the Blocked User's side.
CREATE INDEX user_block_blocked ON user_block (blocked_id);
