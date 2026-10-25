-- A Message may answer a Story (#73). reply_to_story_id points at the Story while it exists; it is cleared when the
-- poster deletes the Story and, through ON DELETE SET NULL, when the expiry sweep removes it, so a Message keeps no
-- reference to a Story that has gone. replied_to_story stays true, so the Message still reads as a Story reply (with
-- the Story unavailable). A Message answers a Message or a Story, never both.
ALTER TABLE message ADD COLUMN reply_to_story_id UUID REFERENCES story (id) ON DELETE SET NULL;
ALTER TABLE message ADD COLUMN replied_to_story BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE message ADD CONSTRAINT message_story_reply_flagged CHECK (reply_to_story_id IS NULL OR replied_to_story);
ALTER TABLE message ADD CONSTRAINT message_one_reply_target CHECK (NOT (replied_to_story AND reply_to_id IS NOT NULL));

-- Finds the replies to a Story when it is deleted, to clear their references (MessageRepository.clearReplyToStory).
CREATE INDEX message_reply_to_story ON message (reply_to_story_id) WHERE reply_to_story_id IS NOT NULL;
