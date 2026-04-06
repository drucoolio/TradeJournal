/**
 * lib/db.ts — Typed query functions for the Supabase database.
 *
 * ALL functions here use the service-role client (serverClient) so they bypass
 * Row Level Security. This is intentional — these functions run server-side
 * only (in API routes and Server Components), never in client code.
 *
 * Design principles:
 *  - Every function returns a typed result and never throws. Errors are logged
 *    and an empty/null value is returned so the UI degrades gracefully.
 *  - Queries are kept simple and composable. Business logic (metrics, aggregates)
 *    lives in the page/component layer, not here.
 *  - All reads are ordered deterministically so pagination is safe later.
 */

import { serverClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// TypeScript interfaces — mirror the Supabase table columns exactly
// ---------------------------------------------------------------------------

/**
 * Represents one row in the `accounts` table.
 * An account maps 1:1 to an MT5 account number (login).
 * user_id links it to the Supabase Auth user who added it.
 */
export interface DbAccount {
  id: string;           // uuid PK
  login: number;        // MT5 account number (unique)
  name: string;         // display name from MT5 (e.g. "John Doe")
  broker: string;       // MT5 server name (e.g. "FundedNext-Server 2")
  currency: string;     // account currency (e.g. "USD")
  balance: number;      // current account balance
  equity: number;       // current equity (balance + open P&L)
  leverage: number;     // e.g. 100 for 1:100 leverage
  created_at: string;   // ISO timestamp
  updated_at: string;   // ISO timestamp
}

/**
 * Represents one row in the `trades` table.
 * Each row = one completed round-trip trade (entry + exit pair).
 * Produced by lib/normalizer.ts which pairs MT5 IN/OUT deals by position_id.
 */
export interface DbTrade {
  id: string;                    // uuid PK
  account_id: string;            // FK → accounts.id
  position_id: number;           // MT5 position ID (unique per account)
  ticket: number | null;         // MT5 ticket number of the closing deal
  symbol: string;                // instrument (e.g. "EURUSD", "XAUUSD")
  direction: "buy" | "sell";     // trade direction
  lot_size: number;              // position size in lots
  open_price: number | null;     // price at which position was opened
  close_price: number | null;    // price at which position was closed
  sl: number | null;             // stop-loss level (null if not set)
  tp: number | null;             // take-profit level (null if not set)
  open_time: string | null;      // ISO timestamp of entry deal
  close_time: string | null;     // ISO timestamp of exit deal (null = still open)
  duration_minutes: number | null; // how long position was held
  pnl: number;                   // gross profit/loss (before commission + swap)
  pnl_pips: number | null;       // P&L expressed in pips
  commission: number;            // broker commission (usually negative)
  swap: number;                  // overnight swap charges (positive or negative)
  net_pnl: number;               // pnl + commission + swap = what you actually made
  tags: string[];                // user-assigned tags for filtering
  notes: string | null;          // legacy plain-text trade notes (kept populated via extractPlainText)
  notes_json: unknown | null;    // TipTap JSON AST — source of truth for the rich editor
  notes_html: string | null;     // HTML snapshot for read-only rendering / previews
  setup_type: string | null;     // e.g. "breakout", "reversal"
  mood: string | null;           // trader mood at entry
  mistakes: string | null;       // post-trade mistake notes
  screenshot_url: string | null; // Supabase Storage URL for trade screenshot
  created_at: string;
  updated_at: string;
}

/**
 * Represents one row in the `sessions` table.
 * A session = one trading day. Computed by the sync route and stored as a
 * daily summary to enable fast calendar/heatmap queries without aggregating
 * all trades on every load.
 */
export interface DbSession {
  id: string;
  account_id: string;   // FK → accounts.id
  date: string;         // "YYYY-MM-DD" (the trading day)
  total_pnl: number;    // sum of net_pnl across all trades that day
  trade_count: number;  // number of completed trades that day
  notes: string | null;       // legacy plain-text daily notes
  notes_json?: unknown | null; // TipTap JSON AST for the rich editor
  notes_html?: string | null;  // HTML snapshot
}

// ---------------------------------------------------------------------------
// Account queries
// ---------------------------------------------------------------------------

/**
 * Fetches a single account by MT5 login number.
 * Returns null if not found or on error (e.g. account not yet synced).
 *
 * Used as a fallback in overview/page.tsx when the active account (from the
 * mt5_account cookie) isn't yet in the allAccounts list returned by
 * getAccountsByUserId — which happens if the account was synced before
 * Phase 3 (before user_id was added to the accounts table).
 */
export async function getAccountByLogin(login: string | number): Promise<DbAccount | null> {
  const db = serverClient();
  const { data, error } = await db
    .from("accounts")
    .select("*")
    .eq("login", login)
    .single(); // throws if 0 or >1 rows; error is caught below
  if (error) return null;
  return data as DbAccount;
}

/**
 * Fetches all accounts linked to a specific Supabase Auth user.
 * Ordered by creation date so the list is stable across renders.
 *
 * This is the primary source of truth for the "All accounts" dropdown —
 * the user sees exactly the accounts they linked via /api/connect.
 *
 * Note: accounts synced BEFORE Phase 3 won't have user_id set, so they
 * won't appear here. Fix: manually set user_id in Supabase dashboard, or
 * click Resync (which re-upserts with user_id).
 */
export async function getAccountsByUserId(userId: string): Promise<DbAccount[]> {
  const db = serverClient();
  const { data, error } = await db
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getAccountsByUserId error:", error.message);
    return [];
  }
  return (data ?? []) as DbAccount[];
}

/**
 * Fetches multiple accounts by their MT5 login numbers.
 * Useful when you have a list of logins (e.g. from mt5_credentials) and
 * need the full account rows (balance, currency, etc.).
 *
 * Returns an empty array if the logins list is empty (avoids a DB call).
 */
export async function getAccountsByLogins(logins: number[]): Promise<DbAccount[]> {
  if (!logins.length) return []; // short-circuit: .in() with empty array returns all rows
  const db = serverClient();
  const { data, error } = await db
    .from("accounts")
    .select("*")
    .in("login", logins); // Supabase: WHERE login IN (...)
  if (error) {
    console.error("getAccountsByLogins error:", error.message);
    return [];
  }
  return (data ?? []) as DbAccount[];
}

// ---------------------------------------------------------------------------
// Trade queries
// ---------------------------------------------------------------------------

/**
 * Fetches ALL closed trades for a single account, ordered most-recent first.
 * Use for per-account pages where you want the full history.
 *
 * For multi-account or date-filtered fetches, use getTradesForAccounts instead.
 */
export async function getAllTrades(accountId: string): Promise<DbTrade[]> {
  const db = serverClient();
  const { data, error } = await db
    .from("trades")
    .select("*")
    .eq("account_id", accountId)
    .order("close_time", { ascending: false });
  if (error) {
    console.error("getAllTrades error:", error.message);
    return [];
  }
  return (data ?? []) as DbTrade[];
}

// ---------------------------------------------------------------------------
// Phase 2 scalability: default date windowing + hard row cap.
// ---------------------------------------------------------------------------
//
// Every page that fetches trades (Overview, Day View, Trade View) used to
// fetch the user's ENTIRE trade history with no cap. That works at 100 trades
// per user and dies at 10k. The Phase 2 solution is two layers of safety:
//
//   1. DEFAULT_WINDOW_MONTHS — if the caller doesn't specify a `from` date,
//      we automatically filter to "last N months". Callers can still pass
//      an explicit `from` (including a very old one) to bypass this default.
//
//   2. DEFAULT_TRADE_LIMIT — a hard row cap applied to every query. Even if
//      the date window is wide and the user is a heavy trader, we will never
//      return more than this many rows in a single request. Callers that
//      need more should paginate.
//
// These are constants (not env vars) because they're part of the product's
// scalability contract — changing them should be a deliberate code review,
// not a config flip.
// ---------------------------------------------------------------------------

/** Default lookback window in months when no `from` date is passed. */
export const DEFAULT_WINDOW_MONTHS = 12;

/** Hard cap on rows returned by a single getTradesForAccounts call. */
export const DEFAULT_TRADE_LIMIT = 5000;

/**
 * Returns an ISO date string (YYYY-MM-DD) for N months before today.
 * Used as the automatic lower bound when the caller omits `from`.
 */
function monthsAgoISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Options for getTradesForAccounts. Kept as an object so callers can pass
 * only the fields they care about and we can add more later without breaking
 * the positional signature.
 */
export interface GetTradesOptions {
  /** ISO date (YYYY-MM-DD). Default: DEFAULT_WINDOW_MONTHS ago. Pass "1970-01-01" to truly fetch all time. */
  from?: string;
  /** ISO date (YYYY-MM-DD). Default: no upper bound. */
  to?: string;
  /** Max rows to return. Default: DEFAULT_TRADE_LIMIT. */
  limit?: number;
  /** Sort direction. Default: ascending (oldest → newest) for chart-friendly output. */
  order?: "asc" | "desc";
}

/**
 * The MAIN trade query used by the dashboard overview page.
 *
 * Fetches closed trades for one or more accounts, optionally filtered to a
 * date range. Results are ordered ascending by close_time so charts render
 * chronologically left-to-right without sorting client-side.
 *
 * Multi-account: accountIds is an array of UUIDs (not logins). Pass all
 * user's account IDs for "All accounts" mode, or just one for single-account.
 *
 * Date filtering: from/to are ISO date strings ("YYYY-MM-DD"). Supabase
 * .gte / .lte do >= / <= comparisons on the timestamptz close_time column.
 * The date string is implicitly cast to midnight UTC, which is fine because
 * trades are stored in UTC.
 *
 * Scalability (Phase 2):
 *   - If `from` is omitted, a 12-month default window is applied.
 *   - A hard limit of DEFAULT_TRADE_LIMIT rows is always applied.
 *   - Both of these are overridable per-call via the options object.
 *
 * Returns empty array if accountIds is empty (prevents a DB call that would
 * return every trade in the database).
 */
export async function getTradesForAccounts(
  accountIds: string[],
  options: GetTradesOptions = {},
): Promise<DbTrade[]> {
  if (!accountIds.length) return [];

  const {
    from = monthsAgoISO(DEFAULT_WINDOW_MONTHS),
    to,
    limit = DEFAULT_TRADE_LIMIT,
    order = "asc",
  } = options;

  const db = serverClient();

  // Build query incrementally — Supabase query builder is immutable so we
  // reassign to a narrower type each time we add a filter
  let q = db
    .from("trades")
    .select("*")
    .in("account_id", accountIds)                             // WHERE account_id IN (...)
    .gte("close_time", from)                                  // WHERE close_time >= from
    .order("close_time", { ascending: order === "asc" })      // ORDER BY close_time
    .limit(limit);                                            // hard row cap

  // Optional upper bound (rarely needed — only when slicing historical ranges)
  if (to) q = q.lte("close_time", to);

  const { data, error } = await q;
  if (error) {
    console.error("getTradesForAccounts error:", error.message);
    return [];
  }
  return (data ?? []) as DbTrade[];
}

/**
 * Counts the total number of closed trades for a set of accounts, with the
 * same date-window semantics as getTradesForAccounts. Uses the
 * { count: "exact", head: true } pattern so Supabase returns only the count
 * in a HEAD response — no row data transferred.
 *
 * Used by the Trade View page to show "Showing 500 of 1,234 trades" so the
 * user knows when their window has been truncated by the hard cap.
 */
export async function countTradesForAccounts(
  accountIds: string[],
  options: Omit<GetTradesOptions, "limit" | "order"> = {},
): Promise<number> {
  if (!accountIds.length) return 0;

  const { from = monthsAgoISO(DEFAULT_WINDOW_MONTHS), to } = options;

  const db = serverClient();
  let q = db
    .from("trades")
    .select("*", { count: "exact", head: true })
    .in("account_id", accountIds)
    .gte("close_time", from);

  if (to) q = q.lte("close_time", to);

  const { count, error } = await q;
  if (error) {
    console.error("countTradesForAccounts error:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Fetches trades for a single account within a specific date range.
 * Ordered most-recent first (for display in a table, not for charts).
 *
 * This is a simpler alternative to getTradesForAccounts when you only need
 * one account and want descending order.
 */
export async function getTradesByDateRange(
  accountId: string,
  from: string, // ISO date string inclusive lower bound
  to: string,   // ISO date string inclusive upper bound
): Promise<DbTrade[]> {
  const db = serverClient();
  const { data, error } = await db
    .from("trades")
    .select("*")
    .eq("account_id", accountId)
    .gte("close_time", from)
    .lte("close_time", to)
    .order("close_time", { ascending: false });
  if (error) {
    console.error("getTradesByDateRange error:", error.message);
    return [];
  }
  return (data ?? []) as DbTrade[];
}

/**
 * Returns the total number of closed trades for an account.
 * Uses { count: "exact", head: true } so Supabase returns only the count
 * in the response header, not the actual row data — very efficient.
 */
export async function getTradeCount(accountId: string): Promise<number> {
  const db = serverClient();
  const { count, error } = await db
    .from("trades")
    .select("*", { count: "exact", head: true }) // HEAD request — no body returned
    .eq("account_id", accountId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Computes total net P&L across all trades for an account.
 * Simple helper — fetches all trades and sums net_pnl.
 * For dashboards, prefer computing this from the already-fetched trades array
 * rather than making a separate DB call.
 */
export async function getTotalPnl(accountId: string): Promise<number> {
  const trades = await getAllTrades(accountId);
  return trades.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Session queries
// ---------------------------------------------------------------------------

/**
 * Fetches daily session summaries for an account, ordered most-recent first.
 * Sessions are pre-computed during sync (see /api/sync/route.ts rebuildSessions).
 *
 * The `limit` parameter (default 30) prevents fetching years of history when
 * you only need the last month for a calendar view. Increase for longer ranges.
 *
 * Note: Currently not used directly by the overview page — the page computes
 * daily data from the raw trades array. Sessions are kept as a fast alternative
 * for future analytics pages (heatmaps, reports) that don't need per-trade detail.
 */
export async function getSessions(
  accountId: string,
  limit = 30, // fetch last 30 days by default
): Promise<DbSession[]> {
  const db = serverClient();
  const { data, error } = await db
    .from("sessions")
    .select("*")
    .eq("account_id", accountId)
    .order("date", { ascending: false }) // newest sessions first
    .limit(limit);
  if (error) {
    console.error("getSessions error:", error.message);
    return [];
  }
  return (data ?? []) as DbSession[];
}
