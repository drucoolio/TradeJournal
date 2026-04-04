/**
 * components/charts/CumulativePnlChart.tsx — Running total P&L area chart.
 *
 * Client Component because Recharts charts only work in the browser
 * (they use DOM APIs for rendering and animations).
 *
 * WHAT IT SHOWS:
 *   An area chart where each point is the CUMULATIVE net P&L up to that day.
 *   This is the equity curve — it shows how the account value grew over time.
 *   A rising line = profitable period. Dips show losing streaks.
 *
 * COLOR LOGIC:
 *   Green if the final cumulative P&L is positive (account grew overall).
 *   Red if the final cumulative P&L is negative (account shrank overall).
 *   The gradient fill and line stroke both use this color.
 *
 * DATA FORMAT:
 *   Each data point: { date: "YYYY-MM-DD", pnl: number, cumPnl: number }
 *   Only `date` and `cumPnl` are used here — `pnl` (daily) is for DailyPnlChart.
 *   Data is expected to be in ascending chronological order (as returned by
 *   getTradesForAccounts which orders by close_time ASC).
 *
 * RECHARTS NOTES:
 *   - ResponsiveContainer: makes the chart fill its parent div's width
 *   - AreaChart with linearGradient fill: creates the shaded area below the line
 *   - interval="preserveStartEnd": only shows first and last X-axis labels
 *     (avoids overcrowding when there are many data points)
 *   - activeDot: the dot that appears on hover at the current data point
 */

"use client"; // Required: Recharts uses DOM APIs

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

/** One point in the cumulative P&L chart */
interface DataPoint {
  date: string;    // "YYYY-MM-DD" — shown on X axis
  cumPnl: number;  // running total net P&L up to and including this day
}

interface Props {
  data: DataPoint[];
  currency: string; // used for tooltip label (not currently shown, for future use)
}

/**
 * Formats an ISO date string to a short display like "Jan 15".
 * Used for X-axis tick labels and tooltip header.
 */
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Formats a dollar amount for the Y axis.
 * Uses "K" suffix for values ≥ $1000 to keep axis labels compact.
 * E.g. $1500 → "$1.5K", $250 → "$250"
 */
function formatMoney(value: number) {
  if (Math.abs(value) >= 1000)
    return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Cumulative P&L area chart component.
 * Height is fixed at 180px to match the DailyPnlChart for visual consistency.
 */
export default function CumulativePnlChart({ data, currency }: Props) {
  // Determine color based on the final value in the data array
  // data[data.length - 1]?.cumPnl handles the empty array case gracefully
  const isPositive = (data[data.length - 1]?.cumPnl ?? 0) >= 0;
  const color = isPositive ? "#16c784" : "#ea3943"; // green or red

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {/* SVG gradient definition — referenced by fill="url(#cumPnlGradient)" */}
        {/* Creates the shaded area below the line that fades to transparent */}
        <defs>
          <linearGradient id="cumPnlGradient" x1="0" y1="0" x2="0" y2="1">
            {/* Top of gradient: 30% opacity — visible but not overwhelming */}
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            {/* Bottom: nearly transparent — fades out naturally */}
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines only (no vertical) for a clean look */}
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />

        {/* X axis: dates, formatted as "Jan 15" */}
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}   // hide tick marks
          axisLine={false}   // hide the axis line itself
          interval="preserveStartEnd" // only show first + last label to avoid crowding
        />

        {/* Y axis: P&L values, formatted as "$1.5K" */}
        <YAxis
          tickFormatter={formatMoney}
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          width={52} // fixed width reserves space for the Y axis labels
        />

        {/* Tooltip: shown on hover with exact P&L value */}
        <Tooltip
          contentStyle={{
            background:   "#1b2236", // dark background matches sidebar colour
            border:       "1px solid #2e3d6e",
            borderRadius: 8,
            fontSize:     12,
            color:        "#fff",
          }}
          formatter={(value: number) =>
            [`$${value.toFixed(2)}`, "Cumulative P&L"] // [value, label]
          }
          labelFormatter={formatDate} // formats the date in the tooltip header
        />

        {/* The actual area line + fill */}
        <Area
          type="monotone"               // smooth curve between data points
          dataKey="cumPnl"              // use cumPnl field from data
          stroke={color}                // line colour (green or red)
          strokeWidth={2}
          fill="url(#cumPnlGradient)"  // shaded area uses the gradient defined above
          dot={false}                   // hide dots on each data point (too crowded)
          activeDot={{ r: 4, fill: color }} // dot appears on hover
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
