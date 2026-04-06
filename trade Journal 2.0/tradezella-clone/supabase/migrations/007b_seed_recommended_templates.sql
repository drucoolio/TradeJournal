-- ============================================================
-- 007b_seed_recommended_templates.sql
--
-- Seeds ten "Recommended" templates as global rows (user_id = null).
-- These show up in the Recommended section of the Template modal for
-- every authenticated user. Users can duplicate them into their own
-- library to edit.
--
-- IDEMPOTENCY
-- -----------
-- Uses `on conflict do nothing` on a unique name+null-user key. To make
-- this work we create a partial unique index on the recommended rows.
-- Re-running this file will not create duplicates.
--
-- CONTENT FORMAT
-- --------------
-- `content_json` is a TipTap document AST. Each template uses a simple
-- heading + paragraph + bulletList structure that renders cleanly in
-- the editor. `content_html` is the matching HTML snapshot used for
-- previews.
-- ============================================================

-- Partial unique index so re-seeding is a no-op
create unique index if not exists note_templates_recommended_unique_name
  on note_templates(name)
  where user_id is null;

-- Helper: a tiny function to build a TipTap doc from a heading + bullets.
-- Written inline to keep the seed file self-contained and dropped at end.
create or replace function _seed_tiptap_doc(heading text, bullets text[])
returns jsonb as $$
declare
  items jsonb := '[]'::jsonb;
  b text;
begin
  foreach b in array bullets loop
    items := items || jsonb_build_array(
      jsonb_build_object(
        'type', 'listItem',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', b)
            )
          )
        )
      )
    );
  end loop;

  return jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'heading',
        'attrs', jsonb_build_object('level', 2),
        'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', heading)
        )
      ),
      jsonb_build_object(
        'type', 'bulletList',
        'content', items
      )
    )
  );
end;
$$ language plpgsql;

-- Matching HTML snapshot builder
create or replace function _seed_tiptap_html(heading text, bullets text[])
returns text as $$
declare
  html text;
  b text;
begin
  html := '<h2>' || heading || '</h2><ul>';
  foreach b in array bullets loop
    html := html || '<li><p>' || b || '</p></li>';
  end loop;
  html := html || '</ul>';
  return html;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- Insert the ten templates
-- ------------------------------------------------------------
insert into note_templates (user_id, name, content_json, content_html)
values
  (null, 'Daily Game Plan',
   _seed_tiptap_doc('Daily Game Plan', array[
     'Market bias (bullish / bearish / neutral)',
     'Key levels to watch',
     'Economic events + earnings',
     'A-setups I am hunting today',
     'Max loss / max trades for the day',
     'One thing I will do better than yesterday'
   ]),
   _seed_tiptap_html('Daily Game Plan', array[
     'Market bias (bullish / bearish / neutral)',
     'Key levels to watch',
     'Economic events + earnings',
     'A-setups I am hunting today',
     'Max loss / max trades for the day',
     'One thing I will do better than yesterday'
   ])),

  (null, 'Pre-Market Prep',
   _seed_tiptap_doc('Pre-Market Prep', array[
     'Overnight news scan',
     'Futures / indices levels',
     'Watchlist with entry / stop / target',
     'Sector strength + weakness',
     'Risk per trade for the session'
   ]),
   _seed_tiptap_html('Pre-Market Prep', array[
     'Overnight news scan',
     'Futures / indices levels',
     'Watchlist with entry / stop / target',
     'Sector strength + weakness',
     'Risk per trade for the session'
   ])),

  (null, 'Intra-day Check-in',
   _seed_tiptap_doc('Intra-day Check-in', array[
     'How am I feeling right now?',
     'Am I following my plan?',
     'PnL vs daily max loss',
     'Is the market matching my bias?',
     'Do I need a break?'
   ]),
   _seed_tiptap_html('Intra-day Check-in', array[
     'How am I feeling right now?',
     'Am I following my plan?',
     'PnL vs daily max loss',
     'Is the market matching my bias?',
     'Do I need a break?'
   ])),

  (null, 'Trade Recap: Basic',
   _seed_tiptap_doc('Trade Recap', array[
     'Setup name',
     'Entry reason',
     'Exit reason',
     'What I did well',
     'What I would change',
     'Screenshot'
   ]),
   _seed_tiptap_html('Trade Recap', array[
     'Setup name',
     'Entry reason',
     'Exit reason',
     'What I did well',
     'What I would change',
     'Screenshot'
   ])),

  (null, 'Trade Recap: Timeframe Bias',
   _seed_tiptap_doc('Trade Recap — Timeframe Bias', array[
     'Monthly bias',
     'Weekly bias',
     'Daily bias',
     '4H structure',
     '1H entry trigger',
     '5m execution detail',
     'Did lower timeframe agree with higher timeframe?'
   ]),
   _seed_tiptap_html('Trade Recap — Timeframe Bias', array[
     'Monthly bias',
     'Weekly bias',
     'Daily bias',
     '4H structure',
     '1H entry trigger',
     '5m execution detail',
     'Did lower timeframe agree with higher timeframe?'
   ])),

  (null, 'Weekly Recap',
   _seed_tiptap_doc('Weekly Recap', array[
     'Net PnL for the week',
     'Best trade + why',
     'Worst trade + why',
     'Rule violations',
     'Emotional themes',
     'Focus for next week'
   ]),
   _seed_tiptap_html('Weekly Recap', array[
     'Net PnL for the week',
     'Best trade + why',
     'Worst trade + why',
     'Rule violations',
     'Emotional themes',
     'Focus for next week'
   ])),

  (null, 'Weekly Report Card',
   _seed_tiptap_doc('Weekly Report Card', array[
     'Win rate %',
     'Profit factor',
     'Avg win / avg loss',
     'Max drawdown',
     'Number of A+ setups taken',
     'Grade (A / B / C / D)'
   ]),
   _seed_tiptap_html('Weekly Report Card', array[
     'Win rate %',
     'Profit factor',
     'Avg win / avg loss',
     'Max drawdown',
     'Number of A+ setups taken',
     'Grade (A / B / C / D)'
   ])),

  (null, 'Monthly Report Card',
   _seed_tiptap_doc('Monthly Report Card', array[
     'Net PnL vs goal',
     'Best week + why',
     'Worst week + why',
     'Discipline score /10',
     'Process score /10',
     'One habit to install next month'
   ]),
   _seed_tiptap_html('Monthly Report Card', array[
     'Net PnL vs goal',
     'Best week + why',
     'Worst week + why',
     'Discipline score /10',
     'Process score /10',
     'One habit to install next month'
   ])),

  (null, 'Emotion Check-in',
   _seed_tiptap_doc('Emotion Check-in', array[
     'Current emotion (one word)',
     'What triggered it',
     'Body sensations',
     'Is my decision-making compromised?',
     'What would a calm version of me do right now?'
   ]),
   _seed_tiptap_html('Emotion Check-in', array[
     'Current emotion (one word)',
     'What triggered it',
     'Body sensations',
     'Is my decision-making compromised?',
     'What would a calm version of me do right now?'
   ])),

  (null, 'Strengths & Weaknesses',
   _seed_tiptap_doc('Strengths & Weaknesses', array[
     'Top 3 strengths this period',
     'Top 3 weaknesses this period',
     'Which weakness is most costly?',
     'Concrete drill to address it',
     'Review date'
   ]),
   _seed_tiptap_html('Strengths & Weaknesses', array[
     'Top 3 strengths this period',
     'Top 3 weaknesses this period',
     'Which weakness is most costly?',
     'Concrete drill to address it',
     'Review date'
   ]))
on conflict (name) where user_id is null do nothing;

-- Drop the helper functions so they don't pollute the schema
drop function if exists _seed_tiptap_doc(text, text[]);
drop function if exists _seed_tiptap_html(text, text[]);
