-- A Story (GLOSSARY): a short text a User posts for everyone they share a Direct conversation with, seen for 24 hours.
-- Deleting one marks it (deleted_at) so a repeated delete still finds it; nothing ever serves a deleted or expired Story.
CREATE TABLE story (
    id         UUID         PRIMARY KEY,
    poster_id  UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       VARCHAR(16)  NOT NULL CONSTRAINT story_kind_known CHECK (kind IN ('TEXT')),
    text       TEXT,
    tone       VARCHAR(16)  CONSTRAINT story_tone_known CHECK (tone IN ('CLAY', 'OCHRE', 'MOSS', 'SEA', 'SLATE', 'PLUM')),
    created_at TIMESTAMPTZ  NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT story_text_has_text_and_tone CHECK (kind <> 'TEXT' OR (text IS NOT NULL AND tone IS NOT NULL))
);

-- "The live Stories of these posters", for the tray and the cap on live Stories.
CREATE INDEX story_poster_live ON story (poster_id, expires_at) WHERE deleted_at IS NULL;
