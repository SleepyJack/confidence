-- Migration: add response_stats table, drop denormalized response columns from questions
--
-- Run this in the Supabase SQL editor for existing installs.
-- New installs should run schema.sql directly (which already includes these changes).

-- Drop denormalized response columns from questions
ALTER TABLE questions
  DROP COLUMN IF EXISTS response_count,
  DROP COLUMN IF EXISTS avg_response_prec,
  DROP COLUMN IF EXISTS avg_response_conf;

-- Create anonymous response stats table
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

-- Backfill response_stats from existing user_responses (if any)
INSERT INTO response_stats (question_id, player_type, score, confidence, answered_at)
SELECT question_id, 'user', score, confidence, answered_at
FROM user_responses
ON CONFLICT DO NOTHING;
