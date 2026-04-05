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

  // Fetch all trades across all accounts
  let trades: Record<string, unknown>[] = [];
  if (accountIds.length > 0) {
    const { data } = await supa
      .from("trades")
      .select("*")
      .in("account_id", accountIds)
      .order("close_time", { ascending: false });
    trades = (data ?? []) as Record<string, unknown>[];
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
