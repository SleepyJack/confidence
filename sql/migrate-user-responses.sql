-- Migration: Add full answer data to user_responses
-- Run this after add-user-tables.sql

-- Add columns for full answer reconstruction
ALTER TABLE user_responses ADD COLUMN IF NOT EXISTS user_low NUMERIC;
ALTER TABLE user_responses ADD COLUMN IF NOT EXISTS user_high NUMERIC;
ALTER TABLE user_responses ADD COLUMN IF NOT EXISTS correct_answer NUMERIC;
ALTER TABLE user_responses ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;
