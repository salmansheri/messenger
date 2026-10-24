-- Availability (GLOSSARY): how a User says they can be reached, chosen by hand. It only informs others.
ALTER TABLE users
    ADD COLUMN availability VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
        CONSTRAINT users_availability_known CHECK (availability IN ('AVAILABLE', 'BUSY', 'AWAY'));
