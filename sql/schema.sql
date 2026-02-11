-- Canonical schema for the confidence calibration game
-- This is the single source of truth — production and test share this DDL.
--
-- Usage:
--   Production: run this file in the Supabase SQL editor
--   Test schema: run setup-test-schema.sql first (sets search_path),
--                then run this file in the same SQL editor session

-- Trigram extension for fuzzy duplicate detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question          TEXT NOT NULL,
  answer            DOUBLE PRECISION NOT NULL,
  unit              TEXT NOT NULL,
  category          TEXT NOT NULL,
  source_name       TEXT,
  source_url        TEXT,
  creator           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary           TEXT,
  response_count    INTEGER NOT NULL DEFAULT 0,
  avg_response_prec DOUBLE PRECISION,
  avg_response_conf DOUBLE PRECISION
);

-- Partial index: fast lookup of active questions
CREATE INDEX IF NOT EXISTS idx_questions_status
  ON questions (status) WHERE status = 'active';

-- Trigram GIN index: powers check_duplicate_summary similarity search
CREATE INDEX IF NOT EXISTS idx_questions_summary_trgm
  ON questions USING gin (summary gin_trgm_ops);

-- RPC function: find questions with similar summaries
-- Uses GREATEST of similarity + word_similarity (both directions) to catch
-- substring-style duplicates like "X speed" vs "X speed around the Sun"
CREATE OR REPLACE FUNCTION check_duplicate_summary(
  candidate TEXT,
  threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE(id UUID, summary TEXT, sim FLOAT) AS $$
  SELECT q.id, q.summary,
         GREATEST(
           similarity(q.summary, candidate),
           word_similarity(candidate, q.summary),
           word_similarity(q.summary, candidate)
         )::FLOAT AS sim
  FROM questions q
  WHERE q.summary IS NOT NULL
    AND q.status = 'active'
    AND GREATEST(
          similarity(q.summary, candidate),
          word_similarity(candidate, q.summary),
          word_similarity(q.summary, candidate)
        ) > threshold
  ORDER BY sim DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Row Level Security (service_role key bypasses RLS)
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
