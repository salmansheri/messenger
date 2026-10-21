-- Set when the Message that used the image was deleted for everyone. The image can no longer be sent; its files are
-- removed straight away and, if that failed, by the periodic sweep, which then deletes this row too.
ALTER TABLE attachment ADD COLUMN removed_at TIMESTAMPTZ;
