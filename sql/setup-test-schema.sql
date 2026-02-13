-- Test schema setup for integration tests
--
-- Run this in the Supabase SQL editor, then run schema.sql and add-embeddings.sql
-- in the SAME session. The SET search_path makes them create everything inside
-- the "test" schema instead of "public".
--
-- Step 1: paste this file
-- Step 2: paste schema.sql
-- Step 3: paste add-embeddings.sql
-- Step 4: paste the GRANT block below
-- Run all as a single batch.

-- Create the test schema
CREATE SCHEMA IF NOT EXISTS test;

-- Extensions need to be in a schema on the search_path (usually public)
-- They only need to be created once per database, not per schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

SET search_path TO test, public;

-- >>> Now paste and run schema.sql here (same session) <<<
-- >>> Then paste and run add-embeddings.sql <<<

-- Grant the service_role access to the test schema
GRANT USAGE ON SCHEMA test TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO service_role;
