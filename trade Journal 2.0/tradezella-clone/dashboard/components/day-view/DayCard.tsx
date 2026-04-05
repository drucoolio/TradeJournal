/**
 * components/day-view/DayCard.tsx — Single expandable day card.
 *
 * Collapsed view: date header + day rating + net P&L + trade count + expand chevron.
 * Expanded view: mini equity curve + 7-stat grid + full trade table + note preview.
 *
 * Clicking "Add note" or the note preview opens the DailyJournal modal via
 * the onOpenJournal callback supplied by DayViewClient.
 */

"use client";

import type { DbTrade, DbSession } from "@/lib/db";
import { PnlText, StarDisplay } from "@/components/ui";
import DayStatsGrid from "./DayStatsGrid";
import DayEquityCurve from "./DayEquityCurve";
import DayTradeTable from "./DayTradeTable";

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
  date: string; // YYYY-MM-DD
  trades: DbTrade[];
  session: DbSession | null;
  stats: DayStats;
  expanded: boolean;
  onToggle: () => void;
  onOpenJournal: (date: string) => void;
  currency?: string;
}

function formatLongDate(date: string) {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function DayCard({
  date,
  trades,
  session,
  stats,
  expanded,
  onToggle,
  onOpenJournal,
  currency = "USD",
}: Props) {
  // Build running P&L series for the mini equity curve
  const sortedTrades = [...trades].sort(
    (a, b) => (a.close_time ?? "").localeCompare(b.close_time ?? ""),
  );
  let cum = 0;
  const points = sortedTrades
    .filter((t) => t.close_time)
    .map((t) => {
      cum += t.net_pnl;
      return { t: new Date(t.close_time as string).getTime(), cum };
    });

  // day_rating is not in the DbSession base type — access via narrow cast
  const rating =
    (session as unknown as { day_rating?: number | null } | null)?.day_rating ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* ─── Collapsed Header ─────────────────────────────────── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition text-left"
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>

          {/* Date + meta */}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {formatLongDate(date)}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-400">
                {stats.totalTrades} {stats.totalTrades === 1 ? "trade" : "trades"}
              </span>
              {rating > 0 && <StarDisplay value={rating} size="sm" />}
            </div>
          </div>
        </div>

        {/* Right: mini curve + P&L */}
        <div className="flex items-center gap-5 flex-shrink-0">
          <div className="hidden md:block">
            <DayEquityCurve points={points} width={180} height={40} />
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
              Net P&amp;L
            </div>
            <PnlText value={stats.netPnl} className="text-lg font-bold" />
          </div>
        </div>
      </button>

      {/* ─── Expanded Body ────────────────────────────────────── */}
      {expanded && (
        <div>
          <DayStatsGrid stats={stats} currency={currency} />
          <DayTradeTable trades={sortedTrades} />

          {/* Session note preview / Add note button */}
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">
                  Daily journal
                </div>
                {session?.notes ? (
                  <p className="text-xs text-gray-700 line-clamp-2 whitespace-pre-wrap">
                    {session.notes}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 italic">No journal entry for this day yet.</p>
                )}
              </div>
              <button
                onClick={() => onOpenJournal(date)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 flex-shrink-0"
              >
                {session?.notes ? "Edit journal" : "Add note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
