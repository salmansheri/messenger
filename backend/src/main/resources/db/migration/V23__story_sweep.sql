-- "Stories past their expiry", for the sweep that deletes them (#72), oldest first. Deleted Stories go with it once
-- they would have expired, so no separate index is needed for them.
CREATE INDEX story_expiry ON story (expires_at);
