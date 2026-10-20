-- A Message can quote one earlier Message of the same Conversation. The quote is read from the quoted Message when it
-- is fetched, so an edit or a deletion shows through; nothing of the quoted text is copied here.
ALTER TABLE message ADD COLUMN reply_to_id UUID;

-- The pair of columns makes the database itself refuse a quote across Conversations.
ALTER TABLE message ADD CONSTRAINT message_conversation_id_id_key UNIQUE (conversation_id, id);
ALTER TABLE message ADD CONSTRAINT message_reply_to_same_conversation
    FOREIGN KEY (conversation_id, reply_to_id) REFERENCES message (conversation_id, id) ON DELETE SET NULL (reply_to_id);

CREATE INDEX message_reply_to_idx ON message (reply_to_id) WHERE reply_to_id IS NOT NULL;
