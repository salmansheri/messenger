-- Per-Participant settings, private to their owner. They live on the participant row, so leaving or being removed
-- clears them, and coming back starts with the defaults.

-- Muted until this time, or for ever when muted_forever is set. Mute only silences push notifications.
ALTER TABLE participant ADD COLUMN muted_until TIMESTAMPTZ;
ALTER TABLE participant ADD COLUMN muted_forever BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE participant ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE participant ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- An archived Conversation is never pinned; the limit of 3 pins per User is enforced in code under a lock.
ALTER TABLE participant ADD CONSTRAINT participant_not_archived_and_pinned CHECK (NOT (archived AND pinned));
