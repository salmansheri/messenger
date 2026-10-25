-- A Story view (GLOSSARY): that a person has seen a Story. Recorded once per Story and viewer (a repeat changes
-- nothing), and gone with the Story.
CREATE TABLE story_view (
    id        UUID         PRIMARY KEY,
    story_id  UUID         NOT NULL REFERENCES story (id) ON DELETE CASCADE,
    viewer_id UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT story_view_once UNIQUE (story_id, viewer_id)
);
