/**
 * app/journal/JournalClient.tsx — Journal Page Client Component.
 *
 * The interactive half of the Journal page. Handles:
 *   - Displaying trades in a rich, sortable table
 *   - Filtering by symbol, direction, date range, source (sync/manual)
 *   - Quick stats bar (total P&L, win rate, avg trade, trade count)
 *   - Opening the TradeJournalPanel slide-out when clicking a trade
 *   - Navigation to add-trade, daily journal, and weekly review
 *
 * TABLE COLUMNS:
 *   Date | Symbol | Direction | Lots | Entry | Exit | P&L | Pips | Tags | Journal
 *
 * The "Journal" column shows an icon indicating whether the trade has been
 * journaled (any journal fields filled in). This gives a visual overview
 * of journaling completion across all trades.
 *
 * RELATED FILES:
 *   - page.tsx — Server Component providing data
 *   - components/journal/TradeJournalPanel.tsx — slide-out journal form
 *   - /app/journal/add-trade/ — manual trade entry page
 */

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TradeJournalPanel from "@/components/journal/TradeJournalPanel";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface JournalClientProps {
  trades: any[];
  accounts: { id: string; login: number; name: string; broker: string; currency: string }[];
  tags: { id: string; name: string; color: string }[];
  mistakes: { id: string; name: string }[];
  playbooks: { id: string; name: string }[];
}

export default function JournalClient({
  trades: initialTrades,
  accounts,
  tags,
  mistakes,
  playbooks,
}: JournalClientProps) {
  const router = useRouter();

  // ─── Filter State ─────────────────────────────────────────────────
  const [symbolFilter, setSymbolFilter]       = useState("");
  const [directionFilter, setDirectionFilter] = useState<"" | "buy" | "sell">("");
  const [sourceFilter, setSourceFilter]       = useState<"" | "sync" | "manual">("");

  // ─── Trade Journal Panel State ────────────────────────────────────
  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [panelOpen, setPanelOpen]         = useState(false);

  /**
   * Apply filters to the trades list.
   * Uses useMemo to avoid recomputing on every render.
   */
  const filteredTrades = useMemo(() => {
    let result = initialTrades;

    if (symbolFilter) {
      const search = symbolFilter.toUpperCase();
      result = result.filter(t => t.symbol?.toUpperCase().includes(search));
    }

    if (directionFilter) {
      result = result.filter(t => t.direction === directionFilter);
    }

    if (sourceFilter) {
      result = result.filter(t => t.source === sourceFilter);
    }

    return result;
  }, [initialTrades, symbolFilter, directionFilter, sourceFilter]);

  /**
   * Compute quick stats from the filtered trades.
   */
  const stats = useMemo(() => {
    const total    = filteredTrades.length;
    const wins     = filteredTrades.filter(t => t.net_pnl > 0).length;
    const totalPnl = filteredTrades.reduce((sum: number, t: any) => sum + (t.net_pnl ?? 0), 0);
    const avgPnl   = total > 0 ? totalPnl / total : 0;
    const winRate  = total > 0 ? (wins / total) * 100 : 0;
    return { total, wins, totalPnl, avgPnl, winRate };
  }, [filteredTrades]);

  /**
   * Checks if a trade has any journal content filled in.
   * Used to show a "journaled" indicator in the table.
   */
  function isJournaled(trade: any): boolean {
    return !!(
      trade.trade_thesis || trade.notes ||
      trade.went_right || trade.went_wrong || trade.lessons ||
      trade.execution_rating || trade.setup_rating ||
      trade.mood_entry || trade.mood_exit ||
      (trade.mistake_ids && trade.mistake_ids.length > 0)
    );
  }

  /**
   * Opens the journal panel for a specific trade.
   */
  function openJournal(trade: any) {
    setSelectedTrade(trade);
    setPanelOpen(true);
  }

  /**
   * Formats a datetime string for compact table display.
   * Example: "Apr 5, 14:30"
   */
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
           ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return (
    <>
      {/* ─── Page Header + Actions ─────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Trade journal</h1>
          <p className="text-sm text-gray-400">Review, journal, and learn from your trades</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/journal/add-trade"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500
                       text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add trade
          </Link>
        </div>
      </div>

      {/* ─── Quick Stats Bar ───────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Total P&L */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Total P&L</p>
          <p className={`text-lg font-semibold ${stats.totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
            {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
          </p>
        </div>

        {/* Win Rate */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Win rate</p>
          <p className="text-lg font-semibold text-gray-900">{stats.winRate.toFixed(1)}%</p>
        </div>

        {/* Avg Trade */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Avg trade</p>
          <p className={`text-lg font-semibold ${stats.avgPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
            {stats.avgPnl >= 0 ? "+" : ""}${stats.avgPnl.toFixed(2)}
          </p>
        </div>

        {/* Trade Count */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Trades</p>
          <p className="text-lg font-semibold text-gray-900">{stats.total}</p>
        </div>
      </div>

      {/* ─── Filters Bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        {/* Symbol search */}
        <input
          type="text"
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          placeholder="Search symbol..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 w-40
                     focus:outline-none focus:border-indigo-400 transition"
        />

        {/* Direction filter */}
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition"
        >
          <option value="">All directions</option>
          <option value="buy">Buy (Long)</option>
          <option value="sell">Sell (Short)</option>
        </select>

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition"
        >
          <option value="">All sources</option>
          <option value="sync">Synced (MT5)</option>
          <option value="manual">Manual</option>
        </select>

        {/* Trade count indicator */}
        <span className="text-xs text-gray-400 ml-auto">
          Showing {filteredTrades.length} of {initialTrades.length} trades
        </span>
      </div>

      {/* ─── Trades Table ──────────────────────────────────────────── */}
      {filteredTrades.length === 0 ? (
        /* Empty state */
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm mb-1">No trades found</p>
          <p className="text-gray-500 text-xs mb-4">Sync your MT5 account or add trades manually</p>
          <Link
            href="/journal/add-trade"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500
                       text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
          >
            Add your first trade
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Date</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Symbol</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Dir</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Lots</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Entry</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Exit</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 text-right">P&L</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 text-right">Pips</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400">Tags</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 text-center">
                  {/* Journal icon header */}
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade: any) => (
                <tr
                  key={trade.id}
                  onClick={() => openJournal(trade)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition"
                >
                  {/* Date */}
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {formatDate(trade.close_time)}
                  </td>

                  {/* Symbol */}
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                    {trade.symbol}
                    {trade.source === "manual" && (
                      <span className="ml-1 text-[9px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded">M</span>
                    )}
                  </td>

                  {/* Direction */}
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded
                      ${trade.direction === "buy" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {trade.direction === "buy" ? "BUY" : "SELL"}
                    </span>
                  </td>

                  {/* Lots */}
                  <td className="px-4 py-2.5 text-xs text-gray-600">{trade.lot_size}</td>

                  {/* Entry price */}
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {trade.open_price?.toFixed(5) ?? "—"}
                  </td>

                  {/* Exit price */}
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {trade.close_price?.toFixed(5) ?? "—"}
                  </td>

                  {/* Net P&L */}
                  <td className={`px-4 py-2.5 text-xs font-medium text-right
                    ${trade.net_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {trade.net_pnl >= 0 ? "+" : ""}${trade.net_pnl?.toFixed(2) ?? "0.00"}
                  </td>

                  {/* Pips */}
                  <td className={`px-4 py-2.5 text-xs text-right
                    ${(trade.pnl_pips ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {trade.pnl_pips != null ? `${trade.pnl_pips >= 0 ? "+" : ""}${trade.pnl_pips.toFixed(1)}` : "—"}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 max-w-[120px] overflow-hidden">
                      {(trade.tags ?? []).slice(0, 2).map((tagName: string) => {
                        const tagData = tags.find(t => t.name === tagName);
                        return (
                          <span
                            key={tagName}
                            className="text-[9px] px-1.5 py-0.5 rounded-full text-white truncate"
                            style={{ backgroundColor: tagData?.color ?? "#6b7280" }}
                          >
                            {tagName}
                          </span>
                        );
                      })}
                      {(trade.tags ?? []).length > 2 && (
                        <span className="text-[9px] text-gray-400">+{trade.tags.length - 2}</span>
                      )}
                    </div>
                  </td>

                  {/* Journal indicator */}
                  <td className="px-4 py-2.5 text-center">
                    {isJournaled(trade) ? (
                      <span className="w-2 h-2 bg-green-500 rounded-full inline-block" title="Journaled" />
                    ) : (
                      <span className="w-2 h-2 bg-gray-200 rounded-full inline-block" title="Not journaled" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Trade Journal Slide-out Panel ─────────────────────────── */}
      <TradeJournalPanel
        trade={selectedTrade}
        isOpen={panelOpen}
        onClose={() => { setPanelOpen(false); setSelectedTrade(null); }}
        onSaved={() => router.refresh()}
        tags={tags}
        mistakes={mistakes}
        playbooks={playbooks}
      />
    </>
  );
}
