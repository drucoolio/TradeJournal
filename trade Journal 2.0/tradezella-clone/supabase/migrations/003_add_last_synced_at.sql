/**
 * Migration 003: Add last_synced_at column to accounts table.
 *
 * PURPOSE:
 *   Tracks when each account was last synced to enforce a 15-minute rate limit
 *   between manual syncs and to let the hourly auto-sync cron skip recently
 *   synced accounts.
 *
 * COLUMN:
 *   last_synced_at TIMESTAMPTZ — set to NOW() after every successful sync.
 *   Nullable because existing accounts haven't been synced through the new
 *   system yet. A NULL value means "never synced" and bypasses the rate limit.
 *
 * HOW TO RUN:
 *   Option A — Supabase CLI:
 *     supabase db push
 *
 *   Option B — Supabase Dashboard:
 *     Go to SQL Editor → paste this file → Run
 *
 *   Option C — psql:
 *     psql $DATABASE_URL -f supabase/migrations/003_add_last_synced_at.sql
 */

-- Add last_synced_at column (nullable, no default — NULL means "never synced")
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Add an index for the cron job which queries accounts ordered by last sync time
-- This lets the cron efficiently find accounts that need syncing
CREATE INDEX IF NOT EXISTS idx_accounts_last_synced_at
  ON accounts (last_synced_at NULLS FIRST);

-- Add a comment explaining the column's purpose
COMMENT ON COLUMN accounts.last_synced_at IS
  'Timestamp of the last successful sync. Used to enforce 15-min rate limit and auto-sync scheduling.';
