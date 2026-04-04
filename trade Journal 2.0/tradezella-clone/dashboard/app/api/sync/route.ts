/**
 * POST /api/sync
 *
 * Browser-triggered full MT5 → Supabase sync.
 * This is the backend for the "Resync" button in the dashboard header
 * and the per-row sync button on the accounts settings page.
 *
 * FLOW:
 *   1. Read mt5_account cookie → confirm user is logged in with an active account
 *   2. RATE LIMIT: Check if this account was synced in the last 15 minutes
 *   3. MUTEX: Acquire the VPS mutex so only one sync runs at a time
 *   4. RECONNECT: Call VPS /connect to ensure the VPS is connected to the right account
 *   5. GET /account from VPS → upsert the accounts row with fresh balance
 *   6. GET /history from VPS → all raw deals since account inception
 *   7. normalizeDeals() → pair IN/OUT deals → TradeRow array
 *   8. Upsert all trades into Supabase (batched 500 rows at a time, idempotent)
 *   9. Rebuild daily session summaries (sessions table)
 *  10. Update last_synced_at timestamp on the account
 *  11. Return { synced: N, days: M, accountId } to the SyncButton component
 *
 * RATE LIMITING:
 *   Each account can only be synced once every 15 minutes. This prevents
 *   accidental spam-clicking from overloading the VPS and reduces the risk
 *   of concurrent sync conflicts. The cron auto-sync also respects this limit.
 *
 * MUTEX:
 *   The VPS runs a single MT5 session. The mutex ensures that connect → history
 *   runs atomically — no other sync can switch the VPS session in between.
 *
 * RECONNECT:
 *   Before fetching /history, we always call /connect to ensure the VPS is
 *   pointed at the correct account. This prevents data mixing when multiple
 *   users trigger syncs close together.
 *
 * IDEMPOTENCY: Safe to call multiple times. Supabase upsert with
 * onConflict:"account_id,position_id" means re-syncing overwrites each trade
 * row with the latest data but never creates duplicates.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { vpsAccount, vpsHistory, vpsConnect } from "@/lib/vps";
import { serverClient } from "@/lib/supabase";
import { normalizeDeals, tradeRowToSupabase } from "@/lib/normalizer";
import { withSyncMutex } from "@/lib/sync-mutex";
import type { BrokerAccount } from "@/lib/broker";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum seconds between syncs for the same account (15 minutes). */
const RATE_LIMIT_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// Step 2: Rate limit check
// ---------------------------------------------------------------------------

/**
 * Checks if this account was synced within the last RATE_LIMIT_SECONDS.
 * Uses the `last_synced_at` column on the accounts table.
 *
 * Returns null if sync is allowed, or a human-readable wait message if not.
 */
async function checkRateLimit(
  supa: ReturnType<typeof serverClient>,
  login: number | string,
): Promise<{ allowed: false; waitSeconds: number; message: string } | { allowed: true }> {
  const { data: acc } = await supa
    .from("accounts")
    .select("last_synced_at")
    .eq("login", login)
    .single();

  if (!acc?.last_synced_at) {
    // Account has never been synced — allow it
    return { allowed: true };
  }

  const lastSync = new Date(acc.last_synced_at).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - lastSync) / 1000);
  const remaining = RATE_LIMIT_SECONDS - elapsed;

  if (remaining > 0) {
    const mins = Math.ceil(remaining / 60);
    return {
      allowed: false,
      waitSeconds: remaining,
      message: `This account was synced recently. Please wait ${mins} minute${mins === 1 ? "" : "s"} before syncing again.`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Step 5: Upsert the accounts row with fresh data from VPS
// ---------------------------------------------------------------------------

/**
 * Creates or updates the account row in Supabase using fresh data from the VPS.
 * Uses onConflict:"login" so this is safe to call repeatedly — it always
 * reflects the current account state (balance, equity, leverage).
 *
 * Also sets `last_synced_at` to the current time for rate limiting.
 *
 * Returns the internal UUID of the account row, needed to link trades.
 */
async function upsertAccount(
  supa: ReturnType<typeof serverClient>,
  info: Awaited<ReturnType<typeof vpsAccount>>,
): Promise<string> {
  const { data, error } = await supa
    .from("accounts")
    .upsert(
      {
        login:          info.login,
        name:           info.name,
        broker:         info.server,
        currency:       info.currency,
        balance:        info.balance,
        equity:         info.equity,
        leverage:       info.leverage,
        last_synced_at: new Date().toISOString(), // rate limit timestamp
      },
      { onConflict: "login" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`accounts upsert: ${error.message}`);
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Step 8: Upsert trades in batches
// ---------------------------------------------------------------------------

/**
 * Upserts normalized trade rows into the `trades` table in batches of 500.
 *
 * Why batching?
 *   Supabase has a ~6MB request body limit. An account with 5000+ trades
 *   could exceed this in a single upsert call, causing a 413 error.
 *
 * Why onConflict:"account_id,position_id"?
 *   Every trade is uniquely identified by (account_id, position_id). Re-syncing
 *   updates existing rows rather than creating duplicates.
 *
 * Returns total number of trade rows processed across all batches.
 */
async function upsertTrades(
  supa: ReturnType<typeof serverClient>,
  accountId: string,
  rows: ReturnType<typeof normalizeDeals>,
): Promise<number> {
  const BATCH = 500;
  let total = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
      .map((r) => tradeRowToSupabase(r, accountId));

    const { error } = await supa
      .from("trades")
      .upsert(batch as Parameters<typeof supa.from>[0] extends never ? never : never[], {
        onConflict:       "account_id,position_id",
        ignoreDuplicates: false,
      });

    if (error) throw new Error(`trades upsert (batch ${i / BATCH + 1}): ${error.message}`);
    total += batch.length;
  }

  return total;
}

// ---------------------------------------------------------------------------
// Step 9: Rebuild the sessions (daily summaries) table
// ---------------------------------------------------------------------------

/**
 * Rebuilds daily session aggregates for an account.
 * A "session" = one trading day. Aggregates total P&L and trade count per day.
 *
 * These session rows power future analytics pages (heatmaps, reports)
 * without scanning all trades.
 *
 * Returns the number of distinct trading days found.
 */
async function rebuildSessions(
  supa: ReturnType<typeof serverClient>,
  accountId: string,
): Promise<number> {
  const { data: trades, error } = await supa
    .from("trades")
    .select("close_time, net_pnl")
    .eq("account_id", accountId);

  if (error) throw new Error(`fetch trades for sessions: ${error.message}`);

  const byDate = new Map<string, { total_pnl: number; trade_count: number }>();
  for (const t of trades ?? []) {
    if (!t.close_time) continue;
    const date = (t.close_time as string).slice(0, 10);
    const prev = byDate.get(date) ?? { total_pnl: 0, trade_count: 0 };
    byDate.set(date, {
      total_pnl:   prev.total_pnl + (t.net_pnl ?? 0),
      trade_count: prev.trade_count + 1,
    });
  }

  if (byDate.size === 0) return 0;

  const sessionRows = Array.from(byDate.entries()).map(([date, agg]) => ({
    account_id:  accountId,
    date,
    total_pnl:   agg.total_pnl,
    trade_count: agg.trade_count,
  }));

  const { error: sessErr } = await supa
    .from("sessions")
    .upsert(sessionRows, { onConflict: "account_id,date" });

  if (sessErr) throw new Error(`sessions upsert: ${sessErr.message}`);
  return byDate.size;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/sync
 *
 * Called by SyncButton.tsx or AccountRow.tsx. No request body needed —
 * the active account is read from the mt5_account cookie.
 *
 * Returns JSON:
 *   { synced: number, days: number, accountId: string } on success
 *   { error: string, waitSeconds?: number } on failure
 */
export async function POST(req: NextRequest) {
  // Step 1: Read the active account from the httpOnly session cookie
  const cookieStore = await cookies();
  const raw = cookieStore.get("mt5_account")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const account = JSON.parse(raw) as BrokerAccount;

  if (account.broker !== "mt5") {
    return NextResponse.json(
      { error: "Sync is only supported for MT5 accounts currently." },
      { status: 400 },
    );
  }

  try {
    const supa = serverClient();

    // Step 2: Rate limit — check if this account was synced within the last 15 minutes
    const rateCheck = await checkRateLimit(supa, account.login);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.message, waitSeconds: rateCheck.waitSeconds },
        { status: 429 }, // 429 Too Many Requests
      );
    }

    // Steps 3–9: Run inside the mutex so the VPS session can't be switched mid-sync.
    // The mutex ensures only one connect → account → history sequence runs at a time.
    const result = await withSyncMutex(async () => {
      // Step 3 + 4: Reconnect the VPS to this account before doing anything.
      // This is critical — without it, another user's sync could have switched
      // the VPS to a different account between our rate limit check and now.
      // We need the stored password for reconnect, so fetch credentials first.
      const { data: cred } = await supa
        .from("mt5_credentials")
        .select("login, password, server")
        .eq("login", account.login)
        .single();

      if (!cred) throw new Error("Account credentials not found. Please re-add the account.");

      // Reconnect the VPS to this specific account
      await vpsConnect(cred.login, cred.password, cred.server);

      // Step 5: Fetch fresh account info and upsert (now guaranteed to be the right account)
      const accountInfo = await vpsAccount();
      const accountId   = await upsertAccount(supa, accountInfo);

      // Step 6: Fetch full deal history (VPS is definitely connected to this account)
      const historyResp = await vpsHistory();

      // Step 7: Pair IN/OUT deals into complete TradeRows
      const rows = normalizeDeals(historyResp.deals);

      // Step 8: Upsert all trade rows into Supabase (batched, idempotent)
      const synced = await upsertTrades(supa, accountId, rows);

      // Step 9: Rebuild daily session summaries
      const days = await rebuildSessions(supa, accountId);

      return { synced, days, accountId };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
