-- The object key of a User's avatar (null for none). A new picture gets a new key, so its signed link differs and the
-- old file can be removed.
ALTER TABLE users ADD COLUMN avatar_key TEXT;

-- Files that must be removed from storage: put here in the same transaction that stops using them, so a failed
-- removal is retried by the periodic sweep instead of leaving the file behind for ever.
CREATE TABLE stale_file (
    storage_key TEXT PRIMARY KEY,
    since       TIMESTAMPTZ NOT NULL
);
