/**
 * app/trades/[id]/page.tsx — Individual Trade Detail page (Server Component).
 *
 * Matches Tradezella's trade detail layout:
 *   - Full page view (NOT a slide-out), left sidebar remains visible
 *   - Top bar: navigation arrows, symbol, date, "Mark as reviewed"
 *   - Left panel: Stats | Strategy | Executions | Attachments tabs
 *   - Right panel: Chart | Notes | Running P&L tabs
 *
 * The left panel shows trade metrics (P&L, side, lot size, commissions,
 * entry/exit info, trade risk, R-multiples) plus tag selectors for
 * Setups, Mistakes, Custom Tags, Emotions.
 *
 * The right panel has a chart placeholder (TradingView integration later)
 * and a notes section with Trade note + Daily Journal tabs.
 */

import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import TradeDetail from "./TradeDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TradeDetailPage({ params }: PageProps) {
  const { id } = await params;

  // --- Auth gate ---
  const user = await requireAuth();

  const supa = serverClient();

  // Fetch the specific trade
  const { data: trade } = await supa
    .from("trades")
    .select("*")
    .eq("id", id)
    .single();

  if (!trade) notFound();

  // Verify ownership via account → user_id
  const { data: account } = await supa
    .from("accounts")
    .select("id, login, name, broker, currency")
    .eq("id", trade.account_id)
    .eq("user_id", user.id)
    .single();

  if (!account) notFound();

  // Fetch adjacent trades for prev/next navigation
  // Get the trade right before and right after (by close_time)
  const { data: allTrades } = await supa
    .from("trades")
    .select("id, close_time")
    .eq("account_id", trade.account_id)
    .order("close_time", { ascending: false });

  const tradeIds = (allTrades ?? []).map((t: { id: string }) => t.id);
  const currentIndex = tradeIds.indexOf(id);
  const prevId = currentIndex > 0 ? tradeIds[currentIndex - 1] : null;
  const nextId = currentIndex < tradeIds.length - 1 ? tradeIds[currentIndex + 1] : null;

  // Fetch user's tags, mistakes, playbooks for the selectors
  const [tagsResult, mistakesResult, playbooksResult, rulesResult] = await Promise.all([
    supa.from("tags")
      .select("id, name, color, category")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supa.from("mistakes")
      .select("id, name, description")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supa.from("playbooks")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supa.from("rules")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  // Fetch the daily session for this trade's date (for the Daily Journal tab)
  const tradeDate = trade.close_time
    ? new Date(trade.close_time).toISOString().slice(0, 10)
    : null;

  let session = null;
  if (tradeDate) {
    const { data: sessionData } = await supa
      .from("sessions")
      .select("*")
      .eq("account_id", trade.account_id)
      .eq("date", tradeDate)
      .single();
    session = sessionData;
  }

  return (
    <TradeDetail
      trade={trade}
      account={account}
      prevTradeId={prevId}
      nextTradeId={nextId}
      tags={(tagsResult.data ?? []) as { id: string; name: string; color: string; category: string }[]}
      mistakes={(mistakesResult.data ?? []) as { id: string; name: string; description: string | null }[]}
      playbooks={(playbooksResult.data ?? []) as { id: string; name: string }[]}
      rules={(rulesResult.data ?? []) as { id: string; name: string }[]}
      session={session}
    />
  );
}
