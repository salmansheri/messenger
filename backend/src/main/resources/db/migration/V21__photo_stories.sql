-- A photo Story (#70) shows an upload, with the text as an optional caption. The link lives on the Story, so an upload
-- is used by at most one Story (UNIQUE), and the sweep for never-sent uploads asks Stories as well as Messages whether
-- they refer to it. Deleting a photo Story lets go of its upload (attachment_id becomes null), like a deleted image
-- Message.
ALTER TABLE story ADD COLUMN attachment_id UUID UNIQUE REFERENCES attachment (id);

ALTER TABLE story DROP CONSTRAINT story_kind_known;
ALTER TABLE story ADD CONSTRAINT story_kind_known CHECK (kind IN ('TEXT', 'PHOTO'));

-- Kind decides the columns: a text Story has text and a tone and no upload; a photo Story has no tone and has its
-- upload until it is deleted.
ALTER TABLE story DROP CONSTRAINT story_text_has_text_and_tone;
ALTER TABLE story ADD CONSTRAINT story_kind_matches_columns CHECK (
    (kind = 'TEXT' AND text IS NOT NULL AND tone IS NOT NULL AND attachment_id IS NULL)
    OR (kind = 'PHOTO' AND tone IS NULL AND (attachment_id IS NOT NULL OR deleted_at IS NOT NULL)));
