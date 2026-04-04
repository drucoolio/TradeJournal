-- ============================================================
-- 002_auth_accounts.sql
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Adds user-scoped auth to the accounts table and a new
-- mt5_credentials table for storing investor passwords.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add user_id to accounts (links each MT5 account to a user)
-- ------------------------------------------------------------
alter table accounts
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists accounts_user_id_idx on accounts(user_id);

-- ------------------------------------------------------------
-- 2. mt5_credentials — stores investor passwords per user
--    (investor password is read-only — never the master password)
-- ------------------------------------------------------------
create table if not exists mt5_credentials (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  login      bigint not null,
  password   text not null,   -- investor (read-only) password
  server     text not null,   -- e.g. "FundedNext-Server 2"
  label      text,            -- optional user-defined nickname
  created_at timestamptz default now(),

  unique(user_id, login)
);

alter table mt5_credentials enable row level security;

-- Users can only see and manage their own credentials
create policy "users manage own credentials" on mt5_credentials
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypass (for API routes using service role key)
create policy "service role full access" on mt5_credentials
  for all
  using (true);

-- ------------------------------------------------------------
-- 3. Tighten RLS on accounts — users see only their own
-- ------------------------------------------------------------

-- Drop the old catch-all policy
drop policy if exists "service role full access" on accounts;

-- Re-add service role bypass
create policy "service role full access" on accounts
  for all using (true);

-- Users can read their own accounts (for future anon-key queries)
create policy "users read own accounts" on accounts
  for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. Same for trades and sessions — expose via user's accounts
-- ------------------------------------------------------------

-- Drop old catch-all on trades
drop policy if exists "service role full access" on trades;

create policy "service role full access" on trades
  for all using (true);

-- Users can select trades belonging to their accounts
create policy "users read own trades" on trades
  for select
  using (
    exists (
      select 1 from accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

-- Same for sessions
drop policy if exists "service role full access" on sessions;

create policy "service role full access" on sessions
  for all using (true);

create policy "users read own sessions" on sessions
  for select
  using (
    exists (
      select 1 from accounts a
      where a.id = sessions.account_id
        and a.user_id = auth.uid()
    )
  );
