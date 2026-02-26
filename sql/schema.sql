-- Canonical schema for the confidence calibration game
-- This is the single source of truth — production and test share this DDL.
--
-- Usage:
--   Production: run this file in the Supabase SQL editor
--   Test schema: run setup-test-schema.sql first (sets search_path),
--                then run this file in the same SQL editor session

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy text duplicate detection
CREATE EXTENSION IF NOT EXISTS vector;     -- embedding-based duplicate detection

-- ============================================================
-- Questions
-- ============================================================

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
  embedding         vector(768)              -- Gemini text-embedding-004
);

-- Fast lookup of active questions
CREATE INDEX IF NOT EXISTS idx_questions_status
  ON questions (status) WHERE status = 'active';

-- Trigram GIN index: powers check_duplicate_summary similarity search
CREATE INDEX IF NOT EXISTS idx_questions_summary_trgm
  ON questions USING gin (summary gin_trgm_ops);

-- Cosine similarity index for embedding-based duplicate detection
-- IVFFlat is good for <100k rows; switch to HNSW for larger datasets
CREATE INDEX IF NOT EXISTS idx_questions_embedding
  ON questions USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Questions: RPC functions for duplicate detection
-- ============================================================

-- Trigram-based: find questions with similar summaries
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

-- Embedding-based: find questions with similar meaning
CREATE OR REPLACE FUNCTION check_duplicate_embedding(
  query_embedding vector(768),
  threshold FLOAT DEFAULT 0.85
)
RETURNS TABLE(id UUID, summary TEXT, similarity FLOAT) AS $$
  SELECT
    q.id,
    q.summary,
    (1 - (q.embedding <=> query_embedding))::FLOAT AS similarity
  FROM questions q
  WHERE q.embedding IS NOT NULL
    AND q.status = 'active'
    AND (q.embedding <=> query_embedding) < (1 - threshold)
  ORDER BY q.embedding <=> query_embedding
  LIMIT 1;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION check_duplicate_embedding TO service_role;

-- ============================================================
-- User profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle     TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON user_profiles FOR DELETE
  USING (auth.uid() = id);

-- ============================================================
-- User responses (immutable answer history)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer         NUMERIC NOT NULL,          -- midpoint of user's range
  user_low       NUMERIC,                   -- lower bound of confidence interval
  user_high      NUMERIC,                   -- upper bound of confidence interval
  correct_answer NUMERIC,                   -- true answer (denormalised for easy replay)
  is_correct     BOOLEAN,                   -- correct_answer in [user_low, user_high]
  score          NUMERIC NOT NULL,          -- normalised log score (0-100)
  confidence     NUMERIC,                   -- user's stated confidence (0-100)
  answered_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_responses_user_id     ON user_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_responses_question_id ON user_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_user_responses_answered_at ON user_responses(answered_at DESC);

ALTER TABLE user_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own responses"
  ON user_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own responses"
  ON user_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No update/delete policies — response history is immutable

-- ============================================================
-- Response stats (anonymous — covers guest, registered, and ex-users)
-- ============================================================

CREATE TABLE IF NOT EXISTS response_stats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  player_type  TEXT NOT NULL CHECK (player_type IN ('guest', 'user')),
  score        NUMERIC NOT NULL,
  confidence   NUMERIC,
  answered_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_stats_question_id ON response_stats(question_id);
CREATE INDEX IF NOT EXISTS idx_response_stats_player_type ON response_stats(player_type);
CREATE INDEX IF NOT EXISTS idx_response_stats_answered_at ON response_stats(answered_at DESC);

ALTER TABLE response_stats ENABLE ROW LEVEL SECURITY;
