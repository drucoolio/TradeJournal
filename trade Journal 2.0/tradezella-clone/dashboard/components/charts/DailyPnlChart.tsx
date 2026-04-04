/**
 * components/charts/DailyPnlChart.tsx — Per-day P&L bar chart.
 *
 * Client Component because Recharts uses DOM APIs.
 *
 * WHAT IT SHOWS:
 *   A bar chart where each bar represents one trading day's net P&L.
 *   Bars above the zero line are green (profitable day).
 *   Bars below are red (losing day).
 *   The zero reference line separates profit from loss visually.
 *
 * VS CUMULATIVE CHART:
 *   CumulativePnlChart shows the running total (equity curve).
 *   DailyPnlChart shows each day in isolation — useful for spotting
 *   outliers (very good or very bad days) and consistency.
 *
 * COLOR PER BAR:
 *   Recharts Bar component applies one color to all bars by default.
 *   We use <Cell> components to color each bar individually based on its value.
 *   entry.pnl >= 0 → green (#16c784), entry.pnl < 0 → red (#ea3943)
 *
 * DATA FORMAT:
 *   Each data point: { date: "YYYY-MM-DD", pnl: number, cumPnl: number }
 *   Only `date` and `pnl` are used here.
 *
 * RECHARTS NOTES:
 *   - ReferenceLine y={0}: draws the zero baseline so it's clear which bars
 *     are above/below zero (especially useful when all bars are the same sign)
 *   - maxBarSize={20}: caps bar width so wide bars don't dominate on sparse data
 *   - radius={[2,2,0,0]}: slightly rounded top corners for a polished look
 *   - fillOpacity={0.85}: slightly transparent for a softer appearance
 */

"use client"; // Required: Recharts uses DOM APIs

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

/** One bar in the daily P&L chart */
interface DataPoint {
  date: string; // "YYYY-MM-DD"
  pnl: number;  // net P&L for this trading day (sum of all trades that day)
}

interface Props {
  data: DataPoint[]; // expected in chronological order (ascending by date)
}

/**
 * Formats an ISO date string to "Jan 15" for axis labels.
 */
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Formats a dollar amount for the Y axis with "K" suffix for large values.
 */
function formatMoney(value: number) {
  if (Math.abs(value) >= 1000)
    return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Daily P&L bar chart.
 * Fixed height 180px to match CumulativePnlChart.
 */
export default function DailyPnlChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {/* Horizontal grid lines only */}
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />

        {/* X axis: dates as "Jan 15" */}
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />

        {/* Y axis: P&L values as "$1.5K" */}
        <YAxis
          tickFormatter={formatMoney}
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          width={52}
        />

        {/* Zero reference line — separates profitable from losing days */}
        <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />

        {/* Tooltip: shown on hover */}
        <Tooltip
          contentStyle={{
            background:   "#1b2236",
            border:       "1px solid #2e3d6e",
            borderRadius: 8,
            fontSize:     12,
            color:        "#fff",
          }}
          formatter={(value: number) =>
            [`$${value.toFixed(2)}`, "Net P&L"] // [value, label]
          }
          labelFormatter={formatDate}
        />

        {/* Bars with per-bar coloring via Cell components */}
        <Bar dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={20}>
          {data.map((entry, index) => (
            // Cell overrides the bar color for this specific bar only.
            // Without Cell, all bars would be the same color.
            <Cell
              key={`cell-${index}`}
              fill={entry.pnl >= 0 ? "#16c784" : "#ea3943"} // green/red based on value
              fillOpacity={0.85} // slightly transparent for softer visual
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
