-- ============================================================
-- 004_journal_system.sql — Phase 6: Full Trade Journal System
--
-- Creates all new tables and columns for the journal feature:
--   - Tags system (per-user tags with categories)
--   - Mistake library (pre-defined + custom mistakes)
--   - Rules engine (personal trading rules)
--   - Playbook library (strategy definitions)
--   - Manual trade entry (source column)
--   - Per-trade journal (expanded columns)
--   - Daily session journal (expanded columns)
--   - Weekly review journal (new table)
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run
-- ============================================================


-- ============================================================
-- 1. TAGS SYSTEM — per-user tags with categories
-- ============================================================

-- Drop the old global unique constraint on name (was user-agnostic)
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;

-- Add user_id and category to existing tags table
ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS user_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'custom'
    CHECK (category IN ('strategy', 'emotion', 'market_condition', 'mistake', 'custom'));

-- Per-user unique tag names (same user can't have two tags with the same name)
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_idx ON tags(user_id, name);

-- Index for fetching all tags for a user
CREATE INDEX IF NOT EXISTS tags_user_id_idx ON tags(user_id);

-- RLS policy for tags (users can only see/manage their own tags)
CREATE POLICY "users manage own tags" ON tags
  FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- 2. MISTAKE LIBRARY — pre-defined + custom mistakes
-- ============================================================

CREATE TABLE IF NOT EXISTS mistakes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_default  boolean DEFAULT false,  -- true for seeded defaults
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS mistakes_user_id_idx ON mistakes(user_id);

ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON mistakes
  FOR ALL USING (true);

CREATE POLICY "users manage own mistakes" ON mistakes
  FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- 3. RULES ENGINE — personal trading rules
-- ============================================================

CREATE TABLE IF NOT EXISTS rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean DEFAULT true,  -- only active rules show in daily checklist
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS rules_user_id_idx ON rules(user_id);

ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON rules
  FOR ALL USING (true);

CREATE POLICY "users manage own rules" ON rules
  FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- 4. PLAYBOOK LIBRARY — strategy definitions
-- ============================================================

CREATE TABLE IF NOT EXISTS playbooks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  description          text,
  entry_rules          text,
  exit_rules           text,
  ideal_conditions     text,
  timeframes           text[],
  default_rr           numeric,
  example_screenshots  text[],        -- Supabase Storage URLs
  is_active            boolean DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS playbooks_user_id_idx ON playbooks(user_id);

ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON playbooks
  FOR ALL USING (true);

CREATE POLICY "users manage own playbooks" ON playbooks
  FOR ALL USING (auth.uid() = user_id);

-- Auto-update updated_at on playbook edits
CREATE OR REPLACE TRIGGER playbooks_updated_at
  BEFORE UPDATE ON playbooks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 5. EXPAND TRADES TABLE — journal fields + manual trade support
-- ============================================================

-- Source column: distinguishes synced trades from manually entered ones
ALTER TABLE trades ADD COLUMN IF NOT EXISTS source text DEFAULT 'sync'
  CHECK (source IN ('sync', 'manual'));

-- Pre-trade plan fields
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trade_thesis  text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS planned_rr    numeric;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS confidence    integer CHECK (confidence BETWEEN 1 AND 5);

-- Post-trade review fields
ALTER TABLE trades ADD COLUMN IF NOT EXISTS execution_rating integer CHECK (execution_rating BETWEEN 1 AND 5);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS setup_rating    integer CHECK (setup_rating BETWEEN 1 AND 5);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS went_right      text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS went_wrong      text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS lessons         text;

-- Psychology fields (replace the old single 'mood' column)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mood_entry     text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mood_exit      text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS emotion_notes  text;

-- Playbook link
ALTER TABLE trades ADD COLUMN IF NOT EXISTS playbook_id   uuid REFERENCES playbooks(id) ON DELETE SET NULL;

-- Mistake IDs (array of references to mistakes table)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mistake_ids   uuid[];

-- Multiple screenshots (replaces single screenshot_url)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS screenshot_urls text[];

-- Index for filtering manual vs synced trades
CREATE INDEX IF NOT EXISTS trades_source_idx ON trades(source);

-- Index for playbook-based analytics (P&L per strategy)
CREATE INDEX IF NOT EXISTS trades_playbook_id_idx ON trades(playbook_id);


-- ============================================================
-- 6. EXPAND SESSIONS TABLE — daily journal fields
-- ============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS market_conditions text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS went_well        text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS went_poorly      text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS takeaways        text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS goals_tomorrow   text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS day_rating       integer CHECK (day_rating BETWEEN 1 AND 5);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mood_morning     text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mood_midday      text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mood_close       text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rules_followed   uuid[];
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rules_broken     uuid[];


-- ============================================================
-- 7. WEEKLY REVIEWS TABLE — weekly reflection journal
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id            uuid REFERENCES accounts(id) ON DELETE CASCADE,  -- nullable for cross-account reviews
  week_start            date NOT NULL,       -- Monday of the reviewed week
  week_end              date NOT NULL,       -- Sunday of the reviewed week
  goals_met             jsonb,               -- array of { goal: string, met: boolean }
  top_lessons           text,
  patterns              text,
  strategy_adjustments  text,
  goals_next_week       text,
  confidence            integer CHECK (confidence BETWEEN 1 AND 5),
  week_rating           integer CHECK (week_rating BETWEEN 1 AND 5),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(user_id, account_id, week_start)
);

CREATE INDEX IF NOT EXISTS weekly_reviews_user_id_idx ON weekly_reviews(user_id);

ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON weekly_reviews
  FOR ALL USING (true);

CREATE POLICY "users manage own weekly reviews" ON weekly_reviews
  FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER weekly_reviews_updated_at
  BEFORE UPDATE ON weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 8. SEQUENCE FOR MANUAL TRADE POSITION IDS
-- ============================================================
-- Manual trades need unique position_ids that don't collide with
-- MT5 synced trades. MT5 position_ids are large positive numbers
-- (typically 100000+). We use negative numbers for manual trades.

CREATE SEQUENCE IF NOT EXISTS manual_trade_position_seq
  START WITH -1
  INCREMENT BY -1
  NO MAXVALUE
  NO CYCLE;

COMMENT ON SEQUENCE manual_trade_position_seq IS
  'Generates negative position_ids for manually entered trades to avoid collision with MT5 synced trades (which use large positive numbers).';
