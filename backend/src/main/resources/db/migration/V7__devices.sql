-- A device a User registered to receive push notifications. The token is the push provider's address for it and is
-- unique: the same phone signed in under another account moves the row instead of getting a second one.
CREATE TABLE device (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token      TEXT         NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 1 AND 4096),
    platform   VARCHAR(16)  NOT NULL CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
    created_at TIMESTAMPTZ  NOT NULL
);

CREATE INDEX device_user_idx ON device (user_id);
