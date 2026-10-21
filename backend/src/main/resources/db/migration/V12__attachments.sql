-- An image uploaded by a User. It exists before any Message does (the upload comes first, the send refers to it), so
-- message_id stays null until it is attached. Never-attached rows are removed after a day; a row whose Message is
-- gone is detached (not deleted) so the same sweep removes its files.
CREATE TABLE attachment (
    id           UUID PRIMARY KEY,
    owner_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Object keys of the stored image and its thumbnail.
    storage_key  TEXT        NOT NULL,
    thumbnail_key TEXT       NOT NULL,
    content_type VARCHAR(32) NOT NULL,
    size_bytes   BIGINT      NOT NULL CHECK (size_bytes > 0),
    width        INTEGER     NOT NULL CHECK (width > 0),
    height       INTEGER     NOT NULL CHECK (height > 0),
    message_id   UUID        UNIQUE REFERENCES message (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX attachment_unattached_idx ON attachment (created_at) WHERE message_id IS NULL;
