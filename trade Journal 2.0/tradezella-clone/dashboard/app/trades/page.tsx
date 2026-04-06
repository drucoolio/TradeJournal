/**
 * app/trades/page.tsx — Trade View page (Server Component).
 *
 * Matches Tradezella's "Trade View" layout:
 *   - Top stats row: Net cumulative P&L, Profit factor, Trade win %, Avg win/loss trade
 *   - Full trade table with columns matching Tradezella exactly:
 *     Open date | Symbol | Status | Close date | Entry price | Exit price | Net P&L | Setups | Trade rating | Notes | Side
 *   - Clicking a trade row opens the journal slide-out panel
 *   - "Add Trade" button in the top-left for manual entry
 *
 * DATA FLOW:
 *   Server Component (this file) → fetches trades, tags, mistakes, playbooks
 *   Client Component (TradeViewClient) → renders stats + table + journal panel
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import TradeViewClient from "./TradeViewClient";

export default async function TradeViewPage() {
  // --- Auth gate ---
  const user = await requireAuth();

  const supa = serverClient();

  // Fetch user's accounts
  const { data: accounts } = await supa
    .from("accounts")
    .select("id, login, name, broker, currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const accountIds = (accounts ?? []).map((a: { id: string }) => a.id);

  // ── Phase 2 scalability: windowed + capped trade fetch ───────────────────
  //
  // The Trade View table can't render tens of thousands of rows usefully —
  // the DOM would collapse and the user would never scroll past the first
  // few hundred anyway. We apply the same two-layer safety as the rest of
  // the app:
  //
  //   1. 12-month lookback window (matches DEFAULT_WINDOW_MONTHS in lib/db).
  //      Keeps the typical request small while still covering a full year
  //      of trading history for a new user.
  //
  //   2. Hard cap of 500 rows. The table is a one-shot render (no virtual
  //      scrolling yet), so 500 is a comfortable ceiling that keeps initial
  //      paint snappy. `countTradesForAccounts` is called in parallel so we
  //      can tell the user "Showing 500 of N trades — narrow the range to
  //      see more" inside the client component if truncation occurred.
  //
  // Both of these are overridable later via ?from= / ?to= / ?limit= search
  // params once the toolbar UI lands.
  // ---------------------------------------------------------------------
  const TRADE_VIEW_LIMIT = 500;
  const TRADE_VIEW_MONTHS = 12;
  const windowFromISO = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - TRADE_VIEW_MONTHS);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  let trades: Record<string, unknown>[] = [];
  if (accountIds.length > 0) {
    const { data } = await supa
      .from("trades")
      .select("*")
      .in("account_id", accountIds)
      .gte("close_time", windowFromISO)            // 12-month window
      .order("close_time", { ascending: false })   // newest first for the table
      .limit(TRADE_VIEW_LIMIT);                    // hard cap
    trades = (data ?? []) as Record<string, unknown>[];
    // Note: a `countTradesForAccounts` HEAD query can be added here later to
    // show "Showing 500 of N trades" in TradeViewClient. Deferred until the
    // client UI needs the number.
  }

  // Fetch user's tags, mistakes, and active playbooks for the journal panel
  const [tagsResult, mistakesResult, playbooksResult] = await Promise.all([
    supa.from("tags")
      .select("id, name, color, category")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supa.from("mistakes")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supa.from("playbooks")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  return (
    <TradeViewClient
      trades={trades}
      accounts={(accounts ?? []) as { id: string; login: number; name: string; broker: string; currency: string }[]}
      tags={(tagsResult.data ?? []) as { id: string; name: string; color: string }[]}
      mistakes={(mistakesResult.data ?? []) as { id: string; name: string }[]}
      playbooks={(playbooksResult.data ?? []) as { id: string; name: string }[]}
    />
  );
}
