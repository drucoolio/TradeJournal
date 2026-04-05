/**
 * components/day-view/DayStatsGrid.tsx — Compact 7-stat row shown inside a Day Card.
 *
 * Mirrors Tradezella's day view stats: Total trades, Winners, Losers,
 * Gross P&L, Commissions, Net P&L, Profit Factor, Win %. Fits in a single row
 * using a grid on desktop, wrapping on narrower widths.
 */

import { formatMoney } from "@/components/ui";

interface DayStats {
  totalTrades: number;
  winners: number;
  losers: number;
  grossPnl: number;
  commissions: number;
  netPnl: number;
  profitFactor: number;
  winPct: number;
}

interface Props {
  stats: DayStats;
  currency?: string;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const color =
    tone === "pos" ? "text-green-600" : tone === "neg" ? "text-red-500" : "text-gray-900";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
        {label}
      </span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

export default function DayStatsGrid({ stats, currency = "USD" }: Props) {
  const pnlTone = stats.netPnl > 0 ? "pos" : stats.netPnl < 0 ? "neg" : "neutral";
  const grossTone = stats.grossPnl > 0 ? "pos" : stats.grossPnl < 0 ? "neg" : "neutral";
  return (
    <div className="grid grid-cols-4 md:grid-cols-8 gap-4 p-4 border-b border-gray-100">
      <Stat label="Total trades" value={String(stats.totalTrades)} />
      <Stat label="Winners" value={String(stats.winners)} tone="pos" />
      <Stat label="Losers" value={String(stats.losers)} tone="neg" />
      <Stat label="Gross P&L" value={formatMoney(stats.grossPnl, currency)} tone={grossTone} />
      <Stat
        label="Commissions"
        value={formatMoney(stats.commissions, currency)}
        tone={stats.commissions < 0 ? "neg" : "neutral"}
      />
      <Stat label="Net P&L" value={formatMoney(stats.netPnl, currency)} tone={pnlTone} />
      <Stat
        label="Profit factor"
        value={stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : "—"}
      />
      <Stat label="Win %" value={`${stats.winPct.toFixed(1)}%`} />
    </div>
  );
}
