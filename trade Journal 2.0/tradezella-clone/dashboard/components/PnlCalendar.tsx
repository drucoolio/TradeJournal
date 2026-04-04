/**
 * components/PnlCalendar.tsx — Monthly P&L calendar heatmap.
 *
 * Client Component because it needs useState for the month/year navigation
 * (prev/next month buttons) — the calendar view is independent of the URL.
 *
 * WHAT IT SHOWS:
 *   A standard calendar grid (Sunday → Saturday columns) for the selected month.
 *   Days with trades are colored:
 *     Green background: net positive P&L for the day
 *     Red background: net negative P&L for the day
 *     White: no trades that day (weekend or no activity)
 *   Each colored cell shows the total P&L and trade count for that day.
 *
 * DATA FORMAT:
 *   data: Record<"YYYY-MM-DD", { pnl: number; count: number }>
 *   This is a flat dictionary keyed by date string. The calendar looks up each
 *   day's data by constructing the "YYYY-MM-DD" key for each cell.
 *
 * CALENDAR GRID CONSTRUCTION:
 *   1. Find what day of the week the 1st falls on (0=Sun, 6=Sat)
 *   2. Prepend that many null cells (empty boxes before the 1st)
 *   3. Fill in days 1 → N (N = days in month)
 *   4. Pad with nulls at the end to complete the last row to 7 cells
 *   This ensures the 7-column grid always has complete rows.
 *
 * NAVIGATION:
 *   "This month" button jumps to the current calendar month.
 *   prev/next buttons navigate month by month. The year wraps correctly
 *   (December → January increments the year, January → December decrements).
 *
 * NOTE: The calendar view is purely client-side — it doesn't re-fetch data
 * when you navigate months. The parent passes the full calendarData object
 * (all days) and this component renders only the visible month from it.
 * This means clicking "Previous month" is instant — no loading state needed.
 */

"use client"; // Required: uses useState for month/year navigation

import { useState } from "react";

/** P&L and trade count for one trading day */
interface DayData {
  pnl: number;   // net P&L for this day
  count: number; // number of completed trades this day
}

interface Props {
  /** Full history of daily P&L data, keyed by "YYYY-MM-DD" date strings */
  data: Record<string, DayData>;
}

/** Abbreviated day names for the column headers (Sunday first) */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Formats a P&L number for display inside a calendar cell.
 * Compact format to fit in the small cell: "$1.25K" for large values, "$250" for small.
 */
function fmt(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Monthly P&L calendar component.
 * Starts on the current month by default.
 */
export default function PnlCalendar({ data }: Props) {
  const today = new Date();

  // Current viewed month — starts on today's month, navigable via buttons
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based (0=Jan, 11=Dec)

  /** Navigate to the previous month, wrapping year if needed */
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } // Jan → Dec, decrement year
    else setMonth(m => m - 1);
  }

  /** Navigate to the next month, wrapping year if needed */
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } // Dec → Jan, increment year
    else setMonth(m => m + 1);
  }

  /** Jump back to the current calendar month */
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  // Format the month label for the header: "April 2026"
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year:  "numeric",
  });

  // ── Build the calendar grid ──────────────────────────────────────────────

  // getDay() returns 0 (Sun) through 6 (Sat) — tells us how many blank cells to prepend
  const firstDay = new Date(year, month, 1).getDay();

  // getDate() on the 0th day of the next month = last day of this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build the cells array: null = empty cell, number = day of month
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),                          // blank cells before day 1
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1), // day 1 through N
  ];

  // Pad the end with nulls so the grid has complete rows of 7
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* ── Calendar header: month label + navigation buttons ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Previous month button */}
          <button onClick={prevMonth}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Month + year label */}
          <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>

          {/* Next month button */}
          <button onClick={nextMonth}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* "This month" shortcut button */}
        <button onClick={goToday}
          className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1
                     hover:bg-gray-50 transition">
          This month
        </button>
      </div>

      {/* ── Day-of-week column headers ── */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      {/* gap-px + bg-gray-200 creates a 1px border between cells */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {cells.map((day, i) => {
          // Null cell: blank space before the 1st or after the last day
          if (day === null) {
            return <div key={i} className="bg-gray-50 min-h-[72px]" />;
          }

          // Construct the "YYYY-MM-DD" key to look up this day's data
          // padStart(2, "0") ensures single-digit months/days get a leading zero
          const key  = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const info = data[key]; // undefined if no trades this day

          // Check if this cell is today (for highlighting)
          const isToday = key === today.toISOString().slice(0, 10);

          // Background colour based on the day's P&L
          const bg =
            !info        ? "bg-white" :    // no trades → white
            info.pnl > 0 ? "bg-green-50" : // profitable day → light green
            info.pnl < 0 ? "bg-red-50"   : // losing day → light red
                           "bg-white";      // exactly $0 → white (rare but possible)

          return (
            <div key={i}
              className={`${bg} min-h-[72px] p-1.5 flex flex-col justify-between group relative`}
            >
              {/* Day number — highlighted in indigo if today */}
              <span className={`text-xs font-medium self-end leading-none
                ${isToday ? "text-indigo-600" : "text-gray-400"}`}>
                {day}
              </span>

              {/* P&L and trade count — only shown if there were trades this day */}
              {info && (
                <div className="mt-auto">
                  {/* P&L amount — green for profit, red for loss */}
                  <p className={`text-xs font-semibold leading-tight
                    ${info.pnl > 0 ? "text-green-600" : "text-red-500"}`}>
                    {fmt(info.pnl)}
                  </p>
                  {/* Trade count — "1 trade" or "N trades" */}
                  <p className="text-[10px] text-gray-400 leading-tight">
                    {info.count} {info.count === 1 ? "trade" : "trades"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
