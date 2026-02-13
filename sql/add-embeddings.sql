-- Migration: Add embedding-based duplicate detection
-- Run this AFTER schema.sql has been applied
--
-- Embeddings provide semantic similarity (meaning) rather than
-- character-level similarity (trigrams). This correctly identifies
-- "Earth-Moon distance" ≈ "distance from Earth to Moon" while
-- distinguishing "Number of bones" ≠ "Number of UN members"

-- Enable pgvector extension (available on Supabase free tier)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (768 dimensions for Gemini text-embedding-004)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Index for fast cosine similarity search
-- IVFFlat is good for <100k rows; switch to HNSW for larger datasets
CREATE INDEX IF NOT EXISTS idx_questions_embedding
  ON questions USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- RPC function: find questions with similar embeddings
-- Returns questions where cosine similarity > threshold
-- Cosine distance = 1 - cosine_similarity, so we check distance < (1 - threshold)
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_duplicate_embedding TO service_role;
