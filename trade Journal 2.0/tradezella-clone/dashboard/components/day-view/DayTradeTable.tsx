/**
 * components/day-view/DayTradeTable.tsx — Compact trade table inside a Day Card.
 *
 * Shows every trade for the day with columns matching Trade View:
 * time, symbol, side, net P&L. Each row is a link to /trades/[id]
 * so users can drill down into the full trade detail view.
 */

import Link from "next/link";
import type { DbTrade } from "@/lib/db";
import { SideBadge, PnlText } from "@/components/ui";

interface Props {
  trades: DbTrade[];
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DayTradeTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-gray-400">
        No trades on this day
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2 font-medium">Open</th>
            <th className="text-left px-4 py-2 font-medium">Close</th>
            <th className="text-left px-4 py-2 font-medium">Symbol</th>
            <th className="text-left px-4 py-2 font-medium">Side</th>
            <th className="text-right px-4 py-2 font-medium">Lots</th>
            <th className="text-right px-4 py-2 font-medium">Entry</th>
            <th className="text-right px-4 py-2 font-medium">Exit</th>
            <th className="text-right px-4 py-2 font-medium">Net P&amp;L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {trades.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50 transition">
              <td colSpan={8} className="p-0">
                <Link
                  href={`/trades/${t.id}`}
                  className="grid grid-cols-[1fr_1fr_1.2fr_0.8fr_0.8fr_1fr_1fr_1fr] w-full items-center"
                >
                  <span className="px-4 py-2 text-gray-500 text-xs">{fmtTime(t.open_time)}</span>
                  <span className="px-4 py-2 text-gray-500 text-xs">{fmtTime(t.close_time)}</span>
                  <span className="px-4 py-2 font-medium text-gray-800">{t.symbol}</span>
                  <span className="px-4 py-2">
                    <SideBadge direction={t.direction} />
                  </span>
                  <span className="px-4 py-2 text-right text-gray-600 text-xs">
                    {t.lot_size.toFixed(2)}
                  </span>
                  <span className="px-4 py-2 text-right text-gray-600 text-xs">
                    {t.open_price?.toFixed(5) ?? "—"}
                  </span>
                  <span className="px-4 py-2 text-right text-gray-600 text-xs">
                    {t.close_price?.toFixed(5) ?? "—"}
                  </span>
                  <span className="px-4 py-2 text-right">
                    <PnlText value={t.net_pnl} />
                  </span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
