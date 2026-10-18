-- The application stores emails trimmed and lower-cased (Emails.normalize). Make the database refuse anything else,
-- so exact-match lookups and the UNIQUE constraint can never be fooled by letter case. Only ASCII A-Z is checked on
-- purpose: Java and PostgreSQL disagree on how to lower-case some other characters.
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email !~ '[A-Z]');
