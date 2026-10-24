-- A Withheld Message (GLOSSARY, ADR 0006): sent in a Direct conversation by a User the other Participant had blocked
-- at that moment. withheld_from is that blocker, who never sees it; it is set when the Message is stored and never
-- cleared, so Unblock does not release it. Null for every ordinary Message.
ALTER TABLE message ADD COLUMN withheld_from UUID REFERENCES users (id) ON DELETE SET NULL;

-- "Which Messages are withheld from this viewer here?", for unread counts and the sender's receipt frontier.
CREATE INDEX message_withheld ON message (conversation_id, withheld_from) WHERE withheld_from IS NOT NULL;
