-- Test schema for integration tests
-- Run this once in Supabase SQL editor to set up the test environment
-- This mirrors the public schema structure

-- Create test schema
CREATE SCHEMA IF NOT EXISTS test;

-- Questions table
CREATE TABLE IF NOT EXISTS test.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  creator TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_test_questions_status ON test.questions(status);

-- Duplicate check RPC function for test schema
-- Uses pg_trgm for fuzzy matching on summary field
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION test.check_duplicate_summary(
  candidate TEXT,
  threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE(id UUID, summary TEXT, sim FLOAT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.summary,
    similarity(q.summary, candidate)::FLOAT AS sim
  FROM test.questions q
  WHERE q.status = 'active'
    AND q.summary IS NOT NULL
    AND similarity(q.summary, candidate) > threshold
  ORDER BY sim DESC
  LIMIT 5;
END;
$$;

-- Grant permissions (adjust role as needed for your Supabase setup)
GRANT USAGE ON SCHEMA test TO service_role;
GRANT ALL ON test.questions TO service_role;
GRANT EXECUTE ON FUNCTION test.check_duplicate_summary TO service_role;
