-- Per-Participant receipt positions, as Sequence numbers. Delivered: the latest Message the Participant's client has
-- confirmed receiving. Read: the latest Message they have seen. Both start at the join point, so history from before
-- a Participant joined is neither delivered to nor unread by them, and both only ever move forward.
ALTER TABLE participant
    ADD COLUMN last_delivered_seq BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN last_read_seq      BIGINT NOT NULL DEFAULT 0;

UPDATE participant SET last_delivered_seq = joined_after_seq, last_read_seq = joined_after_seq;

ALTER TABLE participant
    ADD CONSTRAINT participant_receipt_order CHECK (joined_after_seq <= last_read_seq AND last_read_seq <= last_delivered_seq);
