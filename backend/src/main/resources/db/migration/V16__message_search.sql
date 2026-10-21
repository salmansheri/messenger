-- Search (#49): full-text search over Message text (the caption of an image is its text). The configuration is
-- PostgreSQL's 'simple' (no stemming and no stop words, so every language is treated alike) with accents folded by
-- the unaccent dictionary first, so "cafe" finds "Café" and the snippet marks the accented word as written.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION message_search (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION message_search
    ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, word, hword, hword_part, numword, numhword, hword_numpart
    WITH unaccent, simple;

-- The query for what someone typed, split by SearchQuery: `words` through websearch_to_tsquery (which accepts any
-- text) and `prefix` (empty, or 'word':*) through to_tsquery. Either may be empty; to_tsquery is never given an empty
-- text, which it would answer with a NOTICE.
CREATE FUNCTION message_search_query(words text, prefix text) RETURNS tsquery
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN prefix = '' THEN websearch_to_tsquery('message_search', words)
        WHEN btrim(words) = '' THEN to_tsquery('message_search', prefix)
        ELSE websearch_to_tsquery('message_search', words) && to_tsquery('message_search', prefix)
    END
$$;

-- Stored and generated, so an edit replaces the searchable text and a deletion (body null) leaves nothing to find.
-- Adding it rewrites the table and the index is built without CONCURRENTLY, both holding locks while they run: fine
-- at this size, but a large table would want an online migration instead.
ALTER TABLE message
    ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('message_search', coalesce(body, ''))) STORED;

CREATE INDEX message_search_idx ON message USING gin (search_vector);
