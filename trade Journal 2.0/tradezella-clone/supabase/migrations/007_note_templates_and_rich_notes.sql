-- ============================================================
-- 007_note_templates_and_rich_notes.sql
--
-- PURPOSE
-- -------
-- Introduces the Note Templates feature and upgrades trade + session
-- notes from plain text to rich text (TipTap JSON). Design summary:
--
--   • New table `note_templates`: per-user rich-text templates plus
--     shipped "Recommended" templates with `user_id = null`.
--   • New join table `note_template_favourites`: lets a user star any
--     template, including Recommended ones they don't own.
--   • New columns on `trades` and `sessions` to hold the rich JSON +
--     HTML snapshot alongside the legacy plain-text `notes` column.
--     Plain `notes` stays populated on save (extracted plain text) so
--     existing search / legacy readers keep working unchanged.
--
-- WHY nullable user_id on note_templates
-- --------------------------------------
-- Recommended templates ship as global rows (`user_id is null`). Read
-- policy grants visibility to any authenticated user; write policies
-- require `user_id = auth.uid()`, so clients can never create, modify,
-- or delete global rows. Seeds are applied by 007b with the service
-- role client.
--
-- DEFAULTS
-- --------
-- `is_default_trade` and `is_default_journal` let a user pin one
-- template per kind. Uniqueness is enforced with partial indexes so
-- each user has at most one default per kind (but globally-nullable
-- rows are excluded via `user_id is not null`).
--
-- IDEMPOTENCY
-- -----------
-- Every CREATE is guarded (IF NOT EXISTS / DROP POLICY IF EXISTS) so
-- this file is safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. note_templates table
-- ------------------------------------------------------------
create table if not exists note_templates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid null references auth.users(id) on delete cascade,
  name                text not null,
  -- TipTap document AST, source of truth for the editor
  content_json        jsonb not null,
  -- HTML snapshot, used for previews and read-only rendering
  content_html        text not null,
  -- Default flags — at most one true per (user_id, kind) via partial indexes below
  is_default_trade    boolean not null default false,
  is_default_journal  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Fast "list my templates" + "list globals" lookups
create index if not exists note_templates_user_idx
  on note_templates(user_id);

-- Enforce "one default-per-kind per user" (globals excluded by where clause)
create unique index if not exists note_templates_one_default_trade
  on note_templates(user_id)
  where is_default_trade = true and user_id is not null;

create unique index if not exists note_templates_one_default_journal
  on note_templates(user_id)
  where is_default_journal = true and user_id is not null;

-- updated_at auto-bump
create or replace function set_note_templates_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists note_templates_updated_at on note_templates;
create trigger note_templates_updated_at
  before update on note_templates
  for each row execute function set_note_templates_updated_at();

-- ------------------------------------------------------------
-- 2. note_template_favourites table
-- ------------------------------------------------------------
-- A separate join table so users can favourite global "Recommended"
-- templates as well as their own. The alternative (is_favourite bool
-- on note_templates) can't express per-user favourites of a shared row.
create table if not exists note_template_favourites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references note_templates(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, template_id)
);

create index if not exists note_template_favourites_template_idx
  on note_template_favourites(template_id);

-- ------------------------------------------------------------
-- 3. Rich-note columns on trades and sessions
-- ------------------------------------------------------------
-- Additive only. Existing `notes text` column stays and keeps getting
-- written with a plain-text extraction on save.
alter table trades
  add column if not exists notes_json jsonb,
  add column if not exists notes_html text;

alter table sessions
  add column if not exists notes_json jsonb,
  add column if not exists notes_html text;

-- ------------------------------------------------------------
-- 4. Row-Level Security
-- ------------------------------------------------------------
alter table note_templates           enable row level security;
alter table note_template_favourites enable row level security;

-- note_templates: user sees own rows + globals; writes restricted to own
drop policy if exists "select own or global templates" on note_templates;
create policy "select own or global templates"
  on note_templates for select
  using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own templates" on note_templates;
create policy "insert own templates"
  on note_templates for insert
  with check (user_id = auth.uid());

drop policy if exists "update own templates" on note_templates;
create policy "update own templates"
  on note_templates for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete own templates" on note_templates;
create policy "delete own templates"
  on note_templates for delete
  using (user_id = auth.uid());

-- note_template_favourites: everything scoped to auth.uid()
drop policy if exists "select own favourites" on note_template_favourites;
create policy "select own favourites"
  on note_template_favourites for select
  using (user_id = auth.uid());

drop policy if exists "insert own favourites" on note_template_favourites;
create policy "insert own favourites"
  on note_template_favourites for insert
  with check (user_id = auth.uid());

drop policy if exists "delete own favourites" on note_template_favourites;
create policy "delete own favourites"
  on note_template_favourites for delete
  using (user_id = auth.uid());

-- (No UPDATE needed — the table is an append/delete set.)

-- ------------------------------------------------------------
-- 5. Verification (optional — comment out if noisy)
-- ------------------------------------------------------------
-- After applying, run:
--
-- select policyname, cmd from pg_policies
--  where tablename in ('note_templates','note_template_favourites')
--  order by tablename, cmd;
--
-- Expect 4 policies on note_templates (select/insert/update/delete)
-- and 3 policies on note_template_favourites (select/insert/delete).
