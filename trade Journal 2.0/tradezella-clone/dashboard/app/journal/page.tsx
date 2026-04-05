/**
 * app/journal/page.tsx — Main Journal Page (Server Component).
 *
 * The central hub for the trade journaling system. This page displays:
 *   - A filterable, sortable table of all trades
 *   - Quick stats (win rate, total P&L, avg trade)
 *   - Links to Daily and Weekly journal views
 *   - "Add Trade" button for manual entry
 *   - Clicking a trade opens the TradeJournalPanel slide-out
 *
 * DATA FLOW:
 *   1. Server Component fetches trades, tags, mistakes, playbooks
 *   2. Passes everything to JournalClient (client component)
 *   3. JournalClient handles filtering, sorting, and the slide-out panel
 *
 * ARCHITECTURE:
 *   Server Component (this file) → auth + data fetch
 *   Client Component (JournalClient.tsx) → interactive table + panel
 *
 * RELATED FILES:
 *   - JournalClient.tsx — client-side table + trade journal panel
 *   - components/journal/TradeJournalPanel.tsx — per-trade journal
 *   - /api/trades/route.ts — trade API
 *   - /app/journal/add-trade/ — manual trade entry
 */

import { redirect } from "next/navigation";
import { createSupabaseServer, serverClient } from "@/lib/supabase";
import JournalClient from "./JournalClient";

export default async function JournalPage() {
  // --- Auth gate ---
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const supa = serverClient();

  // Fetch user's accounts
  const { data: accounts } = await supa
    .from("accounts")
    .select("id, login, name, broker, currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const accountIds = (accounts ?? []).map(a => a.id);

  // Fetch recent trades (last 100) across all accounts
  let trades: Record<string, unknown>[] = [];
  if (accountIds.length > 0) {
    const { data } = await supa
      .from("trades")
      .select("*")
      .in("account_id", accountIds)
      .order("close_time", { ascending: false })
      .limit(100);
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
    <div className="py-6 px-4 max-w-7xl mx-auto">
      <JournalClient
        trades={trades}
        accounts={(accounts ?? []) as { id: string; login: number; name: string; broker: string; currency: string }[]}
        tags={(tagsResult.data ?? []) as { id: string; name: string; color: string }[]}
        mistakes={(mistakesResult.data ?? []) as { id: string; name: string }[]}
        playbooks={(playbooksResult.data ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
