-- Migration: Add missing columns to existing woss.db
-- Run: sqlite3 data/woss.db < src/scripts/migrate.sql

-- Add result_size to tool_calls (used by UPDATE query in generate.ts and ask/+server.ts)
ALTER TABLE tool_calls ADD COLUMN result_size INTEGER DEFAULT 0;
