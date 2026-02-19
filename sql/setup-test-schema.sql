-- Test schema setup for integration tests
--
-- Run this in the Supabase SQL editor, then run schema.sql in the SAME
-- session. The SET search_path makes schema.sql create everything inside
-- the "test" schema instead of "public".
--
-- Step 1: paste this file
-- Step 2: paste schema.sql
-- Step 3: run all as a single batch

-- Create the test schema
CREATE SCHEMA IF NOT EXISTS test;

-- Extensions live in public and only need creating once per database
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

SET search_path TO test, public;

-- >>> Now paste and run schema.sql here (same session) <<<

-- Grant the service_role access to the test schema
GRANT USAGE ON SCHEMA test TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO service_role;
