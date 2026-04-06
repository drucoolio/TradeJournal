-- ============================================================
-- 006_rls_write_policies.sql — Phase 3 (RLS hardening)
--
-- PURPOSE
-- -------
-- Until now, the app's user-scoped tables (trades, sessions, accounts)
-- only had SELECT policies for the anon / SSR client. Every write — manual
-- trade entry, journal updates, session notes, account updates — was
-- happening through the service-role client, which bypasses RLS entirely.
-- That meant a bug that accidentally omitted a user_id filter could leak
-- data across users. Phase 3 closes that hole by:
--
--   1. Adding explicit INSERT / UPDATE / DELETE policies to trades,
--      sessions, and accounts so the SSR client can perform writes without
--      bypassing RLS.
--   2. Letting us switch the user-facing `apiAuth()` helper to return the
--      SSR client instead of the service-role client. After this migration,
--      user requests are protected by a database-level safety net: even if
--      application code forgets a user_id filter, the database will refuse
--      to return / modify rows that don't belong to the caller.
--
-- IDEMPOTENCY
-- -----------
-- Every policy creation is guarded by a DROP POLICY IF EXISTS before the
-- CREATE so this file can be re-run safely.
--
-- HOW TO APPLY
-- ------------
-- Supabase SQL editor → paste this file → Run. Or `supabase db push` if
-- using the CLI. No CONCURRENTLY anywhere, so the whole file runs in a
-- single transaction.
--
-- BACKWARD COMPATIBILITY
-- ----------------------
-- The existing "service role full access" policies are left in place. This
-- means existing code paths that still use `serverClient()` (the sync job,
-- cron sync, account delete, clear trades) continue to work unchanged —
-- the service-role JWT bypasses RLS automatically, and even if Supabase
-- changes that behavior, the explicit "using (true)" policy would still
-- permit access.
-- ============================================================


-- ---------------- trades ----------------
-- Users can SELECT their own trades (existing policy, left in place).
-- New: users can INSERT a trade ONLY if the target account_id belongs to
-- them. This is the same ownership check the API routes already do in
-- application code; now Postgres enforces it as a last line of defense.
drop policy if exists "users insert own trades" on trades;
create policy "users insert own trades" on trades
  for insert
  with check (
    exists (
      select 1 from accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

-- Users can UPDATE their own trades. The policy has both USING (for the
-- pre-update row) and WITH CHECK (for the post-update row) clauses so that
-- a sneaky update can't re-parent a trade into another user's account.
drop policy if exists "users update own trades" on trades;
create policy "users update own trades" on trades
  for update
  using (
    exists (
      select 1 from accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

-- Users can DELETE their own trades. (Application-level logic still
-- restricts this to source='manual' — the RLS policy is the coarser gate.)
drop policy if exists "users delete own trades" on trades;
create policy "users delete own trades" on trades
  for delete
  using (
    exists (
      select 1 from accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );


-- ---------------- sessions ----------------
-- Sessions inherit ownership through accounts, same pattern as trades.
drop policy if exists "users insert own sessions" on sessions;
create policy "users insert own sessions" on sessions
  for insert
  with check (
    exists (
      select 1 from accounts a
      where a.id = sessions.account_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "users update own sessions" on sessions;
create policy "users update own sessions" on sessions
  for update
  using (
    exists (
      select 1 from accounts a
      where a.id = sessions.account_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from accounts a
      where a.id = sessions.account_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "users delete own sessions" on sessions;
create policy "users delete own sessions" on sessions
  for delete
  using (
    exists (
      select 1 from accounts a
      where a.id = sessions.account_id
        and a.user_id = auth.uid()
    )
  );


-- ---------------- accounts ----------------
-- accounts has a direct user_id column, so the policies are simpler:
-- the row's user_id must equal the caller's auth.uid().
drop policy if exists "users insert own accounts" on accounts;
create policy "users insert own accounts" on accounts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own accounts" on accounts;
create policy "users update own accounts" on accounts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own accounts" on accounts;
create policy "users delete own accounts" on accounts
  for delete
  using (auth.uid() = user_id);


-- ---------------- tags ----------------
-- tags already has "users manage own tags" FOR ALL from migration 004,
-- which covers INSERT/UPDATE/DELETE/SELECT. No change needed here — this
-- comment block exists as documentation so future readers don't wonder
-- why tags is missing from this migration.


-- ---------------- mistakes / rules / playbooks / weekly_reviews ----------------
-- All four tables already have "users manage own X" FOR ALL policies from
-- migration 004. No change needed. Included here as a paper trail.


-- ---------------- VERIFICATION QUERY ----------------
-- After running the migration, check which policies exist on each table:
--
--   select schemaname, tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('trades', 'sessions', 'accounts')
--   order by tablename, cmd;
--
-- Expected result: each of trades, sessions, and accounts should show
-- four "users ..." policies (SELECT, INSERT, UPDATE, DELETE) plus one
-- "service role full access" policy for ALL commands.
