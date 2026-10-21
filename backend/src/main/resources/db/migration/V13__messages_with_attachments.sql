-- A Message may carry one uploaded image. The link lives on the Message, so an image is used by at most one Message
-- (UNIQUE) and the sweep for never-sent uploads asks "does any Message refer to it". A Message needs text, an image
-- or both until it is deleted for everyone, and then it keeps neither.
ALTER TABLE attachment DROP COLUMN message_id;
CREATE INDEX attachment_created_idx ON attachment (created_at);

ALTER TABLE message ADD COLUMN attachment_id UUID UNIQUE REFERENCES attachment (id);
ALTER TABLE message DROP CONSTRAINT message_body_matches_deletion;
ALTER TABLE message ADD CONSTRAINT message_body_matches_deletion CHECK (
    (deleted_at IS NULL AND ((body IS NOT NULL AND char_length(body) BETWEEN 1 AND 4000)
                             OR (body IS NULL AND attachment_id IS NOT NULL)))
    OR (deleted_at IS NOT NULL AND body IS NULL));
