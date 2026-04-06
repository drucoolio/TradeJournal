-- ============================================================
-- 008_modular_tag_categories.sql — Modular tag categories
--
-- Replaces the old hardcoded-category tag system with user-defined
-- categories that can have different field types:
--   multi_select, single_select, star_rating, slider, yes_no, short_text
--
-- Tables:
--   tag_categories         — per-user category definitions (name, field type, config)
--   tag_options            — option list for multi_select / single_select categories
--   trade_category_values  — actual per-trade values (jsonb payload, shape depends on field_type)
--
-- Data migration:
--   The old hardcoded categories (strategy, emotion, market_condition, mistake, custom)
--   are materialised as real rows in tag_categories with field_type = 'multi_select'.
--   Existing tags rows are converted into tag_options under their parent category.
--   Existing trades.tags[] text arrays are backfilled into trade_category_values.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. tag_categories
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tag_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text,                        -- optional emoji/icon name
  color       text DEFAULT '#6366f1',
  field_type  text NOT NULL
    CHECK (field_type IN ('multi_select', 'single_select', 'star_rating',
                          'slider', 'yes_no', 'short_text')),
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- config shapes:
  --   multi_select / single_select : {}            (options live in tag_options)
  --   star_rating                  : { "max": 5 }
  --   slider                       : { "min": 0, "max": 100, "step": 1, "unit": "" }
  --   yes_no                       : { "true_label": "Yes", "false_label": "No" }
  --   short_text                   : { "placeholder": "" }
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS tag_categories_user_position_idx
  ON tag_categories (user_id, position);

ALTER TABLE tag_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own tag_categories" ON tag_categories;
CREATE POLICY "users manage own tag_categories" ON tag_categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 2. tag_options
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tag_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES tag_categories(id) ON DELETE CASCADE,
  label        text NOT NULL,
  color        text DEFAULT '#6366f1',
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, label)
);

CREATE INDEX IF NOT EXISTS tag_options_category_position_idx
  ON tag_options (category_id, position);

ALTER TABLE tag_options ENABLE ROW LEVEL SECURITY;

-- Options inherit ownership through the parent category.
DROP POLICY IF EXISTS "users manage own tag_options" ON tag_options;
CREATE POLICY "users manage own tag_options" ON tag_options
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tag_categories c
      WHERE c.id = tag_options.category_id AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM tag_categories c
      WHERE c.id = tag_options.category_id AND c.user_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 3. trade_category_values
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trade_category_values (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id     uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES tag_categories(id) ON DELETE CASCADE,
  value        jsonb NOT NULL,
  -- value shapes:
  --   multi_select   : { "option_ids": ["<uuid>", "<uuid>"] }
  --   single_select  : { "option_id": "<uuid>" }
  --   star_rating    : { "rating": 4 }
  --   slider         : { "number": 72 }
  --   yes_no         : { "bool": true }
  --   short_text     : { "text": "CPI print" }
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, category_id)
);

CREATE INDEX IF NOT EXISTS trade_category_values_trade_idx
  ON trade_category_values (trade_id);

ALTER TABLE trade_category_values ENABLE ROW LEVEL SECURITY;

-- Values inherit ownership through the parent trade.
DROP POLICY IF EXISTS "users manage own trade_category_values" ON trade_category_values;
CREATE POLICY "users manage own trade_category_values" ON trade_category_values
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_category_values.trade_id AND t.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_category_values.trade_id AND t.user_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 4. Seed + migrate existing tags into the new structure
-- ------------------------------------------------------------
-- For every user that has any tags, we insert 5 rows into tag_categories
-- (one per old hardcoded category) if they don't already exist.
-- Then every existing tag row becomes a tag_option under its parent.

DO $$
DECLARE
  u record;
  cat_id uuid;
  old_category text;
  old_label text;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM tags WHERE user_id IS NOT NULL
  LOOP
    -- Insert default categories if missing.
    FOR old_category, old_label IN
      SELECT * FROM (VALUES
        ('strategy',         'Setups'),
        ('mistake',          'Mistakes'),
        ('custom',           'Custom Tags'),
        ('emotion',          'Emotions'),
        ('market_condition', 'Market Conditions')
      ) AS v(cat, label)
    LOOP
      INSERT INTO tag_categories (user_id, name, field_type, position)
      VALUES (u.user_id, old_label, 'multi_select',
              CASE old_category
                WHEN 'strategy'         THEN 0
                WHEN 'mistake'          THEN 1
                WHEN 'custom'           THEN 2
                WHEN 'emotion'          THEN 3
                WHEN 'market_condition' THEN 4
              END)
      ON CONFLICT (user_id, name) DO NOTHING;
    END LOOP;
  END LOOP;

  -- Migrate every existing tag into tag_options under the correct category.
  INSERT INTO tag_options (category_id, label, color, position)
  SELECT
    c.id,
    t.name,
    COALESCE(t.color, '#6366f1'),
    ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.name) - 1
  FROM tags t
  JOIN tag_categories c
    ON c.user_id = t.user_id
   AND c.name = CASE t.category
                  WHEN 'strategy'         THEN 'Setups'
                  WHEN 'mistake'          THEN 'Mistakes'
                  WHEN 'custom'           THEN 'Custom Tags'
                  WHEN 'emotion'          THEN 'Emotions'
                  WHEN 'market_condition' THEN 'Market Conditions'
                  ELSE 'Custom Tags'
                END
  WHERE t.user_id IS NOT NULL
  ON CONFLICT (category_id, label) DO NOTHING;
END $$;


-- ------------------------------------------------------------
-- 5. Backfill trade_category_values from existing trades.tags[]
-- ------------------------------------------------------------
-- Each text in trades.tags is matched to a tag_option by label for the
-- same user; matching options are grouped by category into a jsonb
-- { "option_ids": [...] } payload.

INSERT INTO trade_category_values (trade_id, category_id, value)
SELECT
  t.id,
  o.category_id,
  jsonb_build_object('option_ids', jsonb_agg(DISTINCT o.id::text))
FROM trades t
CROSS JOIN LATERAL unnest(t.tags) AS tag_name(name)
JOIN tag_categories c ON c.user_id = t.user_id
JOIN tag_options    o ON o.category_id = c.id AND o.label = tag_name.name
WHERE t.tags IS NOT NULL AND array_length(t.tags, 1) > 0
GROUP BY t.id, o.category_id
ON CONFLICT (trade_id, category_id) DO NOTHING;
