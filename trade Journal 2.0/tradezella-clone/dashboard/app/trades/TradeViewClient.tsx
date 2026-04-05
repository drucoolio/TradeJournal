/**
 * app/trades/TradeViewClient.tsx — Trade View Client Component.
 *
 * Matches Tradezella's Trade View layout exactly:
 *
 *   TOP ROW (4 stat cards):
 *     1. Net cumulative P&L (with mini equity curve chart)
 *     2. Profit factor
 *     3. Trade win % (with win/BE/loss count badges)
 *     4. Avg win/loss trade (with bar showing avg win vs avg loss)
 *
 *   TABLE:
 *     Columns: Open date | Symbol | Status | Close date | Entry price | Exit price | Net P&L | Setups | Trade rating | Notes | Side
 *     Status: WIN (green), LOSS (red), BE (blue) — based on net_pnl
 *     Clicking a row navigates to /trades/[id] full trade detail page
 *
 *   FEATURES:
 *     - "Add Trade" button for manual entry (links to /journal/add-trade)
 *     - Filters button (placeholder for future)
 *     - Date range selector (placeholder for future)
 */

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TradeViewClientProps {
  trades: any[];
  accounts: { id: string; login: number; name: string; broker: string; currency: string }[];
  tags: { id: string; name: string; color: string }[];
  mistakes: { id: string; name: string }[];
  playbooks: { id: string; name: string }[];
}

export default function TradeViewClient({
  trades,
  accounts,
  tags,
  mistakes,
  playbooks,
}: TradeViewClientProps) {
  const router = useRouter();

  // ─── Compute Stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = trades.length;
    const wins       = trades.filter(t => (t.net_pnl ?? 0) > 0.5);
    const losses     = trades.filter(t => (t.net_pnl ?? 0) < -0.5);
    const breakevens = trades.filter(t => Math.abs(t.net_pnl ?? 0) <= 0.5);

    const totalPnl   = trades.reduce((sum: number, t: any) => sum + (t.net_pnl ?? 0), 0);
    const grossWins  = wins.reduce((sum: number, t: any) => sum + (t.net_pnl ?? 0), 0);
    const grossLoss  = Math.abs(losses.reduce((sum: number, t: any) => sum + (t.net_pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossWins / grossLoss : grossWins > 0 ? Infinity : 0;
    const winRate      = total > 0 ? (wins.length / total) * 100 : 0;
    const avgWin       = wins.length > 0 ? grossWins / wins.length : 0;
    const avgLoss      = losses.length > 0 ? grossLoss / losses.length : 0;
    const avgRatio     = avgLoss > 0 ? avgWin / avgLoss : 0;

    return {
      total, wins: wins.length, losses: losses.length, breakevens: breakevens.length,
      totalPnl, profitFactor, winRate, avgWin, avgLoss, avgRatio,
    };
  }, [trades]);

  /**
   * Computes cumulative P&L array for the mini equity curve.
   * Returns array of running totals sorted by close_time ascending.
   */
  const equityCurve = useMemo(() => {
    const sorted = [...trades].sort((a, b) =>
      new Date(a.close_time ?? 0).getTime() - new Date(b.close_time ?? 0).getTime()
    );
    let running = 0;
    return sorted.map(t => {
      running += (t.net_pnl ?? 0);
      return running;
    });
  }, [trades]);

  /**
   * Returns trade status: "WIN", "LOSS", or "BE" (breakeven).
   * Breakeven threshold: |net_pnl| <= $0.50
   */
  function getStatus(trade: any): "WIN" | "LOSS" | "BE" {
    const pnl = trade.net_pnl ?? 0;
    if (pnl > 0.5) return "WIN";
    if (pnl < -0.5) return "LOSS";
    return "BE";
  }

  /**
   * Formats a date for the table: "MM/DD/YYYY"
   */
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }

  /**
   * Formats a price value with appropriate decimal places.
   */
  function formatPrice(price: number | null, symbol: string): string {
    if (price === null || price === undefined) return "—";
    const s = (symbol ?? "").toUpperCase();
    if (s.includes("XAU") || s.includes("XAG")) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
    if (s.includes("BTC") || s.includes("ETH")) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (s.includes("JPY")) return price.toFixed(3);
    return price.toFixed(5);
  }

  /**
   * Renders a mini SVG equity curve for the Net P&L stat card.
   */
  function renderMiniChart() {
    if (equityCurve.length < 2) return null;
    const min = Math.min(...equityCurve);
    const max = Math.max(...equityCurve);
    const range = max - min || 1;
    const w = 200;
    const h = 50;

    const points = equityCurve.map((val, i) => {
      const x = (i / (equityCurve.length - 1)) * w;
      const y = h - ((val - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");

    const lastVal = equityCurve[equityCurve.length - 1];
    const color = lastVal >= 0 ? "#22c55e" : "#ef4444";

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12 mt-2" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function openTrade(tradeId: string) {
    router.push(`/trades/${tradeId}`);
  }

  return (
    <div className="py-5 px-5">
      {/* ─── Page Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Trade View</h1>

        <div className="flex items-center gap-3">
          <Link
            href="/journal/add-trade"
            className="inline-flex items-center gap-1.5 bg-[#1b2236] hover:bg-[#2a3450]
                       text-white text-xs font-medium px-3.5 py-2 rounded-lg transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Trade
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          STATS ROW — 4 cards matching Tradezella exactly
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4 gap-4 mb-5">

        {/* 1. Net Cumulative P&L — with mini equity curve */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-gray-400">Net cumulative P&L</p>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
              {stats.total}
            </span>
          </div>
          <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? "text-gray-900" : "text-red-600"}`}>
            ${stats.totalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {renderMiniChart()}
        </div>

        {/* 2. Profit Factor */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">Profit factor</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
          </p>
        </div>

        {/* 3. Trade Win % — with win/BE/loss count pills */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">Trade win %</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats.winRate.toFixed(2)}%
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {stats.wins}
            </span>
            <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {stats.breakevens}
            </span>
            <span className="text-[10px] font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {stats.losses}
            </span>
          </div>
        </div>

        {/* 4. Avg Win/Loss Trade — with ratio + bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">Avg win/loss trade</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats.avgRatio.toFixed(2)}
          </p>
          {/* Win/Loss bar visualization */}
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className="text-green-600 font-medium">
              ${stats.avgWin.toFixed(0)}
            </span>
            <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-gray-100">
              {stats.avgWin + stats.avgLoss > 0 && (
                <>
                  <div
                    className="bg-green-500 h-full"
                    style={{ width: `${(stats.avgWin / (stats.avgWin + stats.avgLoss)) * 100}%` }}
                  />
                  <div
                    className="bg-red-500 h-full"
                    style={{ width: `${(stats.avgLoss / (stats.avgWin + stats.avgLoss)) * 100}%` }}
                  />
                </>
              )}
            </div>
            <span className="text-red-600 font-medium">
              -${stats.avgLoss.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TRADES TABLE — matching Tradezella column layout
          ═══════════════════════════════════════════════════════════════ */}
      {trades.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <p className="text-gray-900 font-medium text-sm mb-1">No trades yet</p>
          <p className="text-gray-400 text-xs mb-4">Sync your MT5 account or add trades manually</p>
          <Link
            href="/journal/add-trade"
            className="inline-flex items-center gap-1.5 bg-[#1b2236] hover:bg-[#2a3450]
                       text-white text-xs font-medium px-3.5 py-2 rounded-lg transition"
          >
            Add your first trade
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {/* Checkbox column (placeholder for bulk actions) */}
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" className="rounded border-gray-300" disabled />
                  </th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Open date</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Symbol</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Status</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Close date</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Entry price</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Exit price</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-right">Net P&L</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-center">Setups</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-center">Trade rating</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-center">Notes</th>
                  <th className="px-3 py-3 text-xs font-medium text-gray-400 text-left">Side</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade: any) => {
                  const status = getStatus(trade);
                  const hasNotes = !!(trade.notes || trade.trade_thesis);
                  const setupName = playbooks.find(p => p.id === trade.playbook_id)?.name;

                  return (
                    <tr
                      key={trade.id}
                      onClick={() => openTrade(trade.id)}
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition"
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          onClick={(e) => e.stopPropagation()}
                          disabled
                        />
                      </td>

                      {/* Open date */}
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(trade.open_time)}
                      </td>

                      {/* Symbol */}
                      <td className="px-3 py-2.5 text-sm font-semibold text-gray-900">
                        {trade.symbol}
                      </td>

                      {/* Status badge: WIN / LOSS / BE */}
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded
                          ${status === "WIN"
                            ? "bg-green-50 text-green-600"
                            : status === "LOSS"
                              ? "bg-red-50 text-red-600"
                              : "bg-blue-50 text-blue-600"
                          }`}>
                          {status}
                        </span>
                      </td>

                      {/* Close date */}
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(trade.close_time)}
                      </td>

                      {/* Entry price */}
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {formatPrice(trade.open_price, trade.symbol)}
                      </td>

                      {/* Exit price */}
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {formatPrice(trade.close_price, trade.symbol)}
                      </td>

                      {/* Net P&L */}
                      <td className={`px-3 py-2.5 text-xs font-semibold text-right
                        ${(trade.net_pnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {(trade.net_pnl ?? 0) >= 0 ? "" : "-"}${Math.abs(trade.net_pnl ?? 0).toFixed(2)}
                      </td>

                      {/* Setups (playbook name) */}
                      <td className="px-3 py-2.5 text-center text-xs text-gray-400">
                        {setupName ?? "—"}
                      </td>

                      {/* Trade rating (stars) */}
                      <td className="px-3 py-2.5 text-center">
                        {trade.execution_rating ? (
                          <div className="flex items-center justify-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(i => (
                              <svg
                                key={i}
                                className={`w-3 h-3 ${i <= trade.execution_rating ? "text-yellow-400" : "text-gray-200"}`}
                                fill="currentColor" viewBox="0 0 24 24"
                              >
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Notes indicator */}
                      <td className="px-3 py-2.5 text-center">
                        {hasNotes ? (
                          <svg className="w-4 h-4 text-indigo-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Side (LONG / SHORT) */}
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-600 uppercase">
                        {trade.direction === "buy" ? "LONG" : "SHORT"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
