/**
 * components/day-view/DayViewCalendar.tsx — Always-visible monthly calendar picker.
 *
 * Sticky right panel on the Day View page. Each day cell is color-coded by
 * P&L (green/red), clicking a day scrolls the matching day card into view
 * and expands it via the onSelectDate callback.
 */

"use client";

import { useState } from "react";

interface DayInfo {
  pnl: number;
  count: number;
}

interface Props {
  data: Record<string, DayInfo>;
  selectedDate?: string | null;
  onSelectDate: (date: string) => void;
}

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function DayViewCalendar({ data, selectedDate, onSelectDate }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  function prev() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Monthly net P&L summary
  const monthTotal = Object.entries(data).reduce((acc, [d, v]) => {
    if (d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)) {
      return acc + v.pnl;
    }
    return acc;
  }, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
        <button onClick={next} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Monthly total */}
      <div className="mb-3 text-center">
        <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
          Net monthly P&amp;L
        </span>
        <div
          className={`text-sm font-bold ${
            monthTotal > 0 ? "text-green-600" : monthTotal < 0 ? "text-red-500" : "text-gray-500"
          }`}
        >
          {monthTotal >= 0 ? "+" : "-"}${Math.abs(monthTotal).toFixed(0)}
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-gray-400 font-medium py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const info = data[key];
          const isToday = key === today.toISOString().slice(0, 10);
          const isSelected = key === selectedDate;

          let cls = "text-gray-500 bg-gray-50 hover:bg-gray-100";
          if (info) {
            cls = info.pnl >= 0
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-red-100 text-red-700 hover:bg-red-200";
          }
          if (isSelected) cls += " ring-2 ring-indigo-500";
          if (isToday) cls += " font-bold";

          return (
            <button
              key={i}
              onClick={() => info && onSelectDate(key)}
              disabled={!info}
              className={`aspect-square rounded-md text-xs transition flex items-center justify-center ${cls} ${
                !info ? "cursor-default" : "cursor-pointer"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
