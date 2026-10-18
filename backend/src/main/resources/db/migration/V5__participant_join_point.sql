-- The Sequence number of the last Message that existed when the Participant joined. A Participant can only read
-- Messages after it, so someone added to a Group later never sees the history from before they joined.
ALTER TABLE participant ADD COLUMN joined_after_seq BIGINT NOT NULL DEFAULT 0;
