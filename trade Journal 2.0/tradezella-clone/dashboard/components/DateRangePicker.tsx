/**
 * components/DateRangePicker.tsx — Custom date range picker matching Tradezella.
 *
 * REPLACES the old preset-only DateRangeDropdown. Gives the user:
 *   - An explicit two-month calendar grid they can click to pick start + end
 *   - A right-side sidebar of quick presets (Today, This week, This month, …)
 *   - A button that shows the resolved range "Jan 11, 2026-Jan 17, 2026"
 *   - An X icon inside the button to clear the selection without opening the panel
 *
 * URL CONTRACT:
 *   The picker writes two search params — ?from=YYYY-MM-DD&to=YYYY-MM-DD — and
 *   lets the Server Component re-fetch trades via overview/page.tsx. No client
 *   state is shared between this component and the chart widgets; everything
 *   flows through the URL so deep-links and back/forward work correctly.
 *
 *   The legacy ?period= param is NOT written anymore; if present on load it's
 *   handled by the page (see overview/page.tsx) for backward compat and then
 *   overridden as soon as the user picks a new range here.
 *
 * INTERACTION MODEL (mirrors Tradezella):
 *   1. First click inside the grid → sets the start date, clears the end date.
 *   2. Hovering after the first click → shows a preview range.
 *   3. Second click → sets the end date (or swaps if the click is earlier than
 *      the start), commits both dates to the URL, and closes the panel.
 *   4. Clicking a preset → computes from/to and commits immediately.
 *   5. Clicking the X inside the trigger button → clears the range (deletes
 *      both from and to params) without opening the panel.
 *
 * TIMEZONE SAFETY:
 *   All dates are treated as local "calendar days". We never call .toISOString()
 *   (which would shift by the UTC offset) — instead, we format via the component's
 *   own pad2/toISODate helpers which build the "YYYY-MM-DD" string from the local
 *   year/month/day components. This means a user in Tokyo clicking "Jan 11" sends
 *   "2026-01-11" to the server, not "2026-01-10" (which would happen if we used
 *   toISOString on a local midnight Date).
 */

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useTransition } from "react";

// ---------------------------------------------------------------------------
// Date helpers — all local-time, never UTC
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Format a Date as "YYYY-MM-DD" using LOCAL year/month/day (no UTC shift). */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse a "YYYY-MM-DD" string into a Date at LOCAL midnight. */
function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Immutable addDays — does not mutate the input. */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Immutable addMonths — handles month-end rollover correctly. */
function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return r;
}

/** Returns a new Date set to the first of the month (local time). */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Returns true if two dates are the same calendar day (ignores time). */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jan 11, 2026" — the format used inside the trigger button. */
function formatShortDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "January 11, 2026" — the format used at the top of the open panel. */
function formatFullDate(d: Date): string {
  return `${MONTHS_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Build a 6-row × 7-col (42-cell) calendar grid for a given year/month,
 * including the leading days from the previous month and trailing days from
 * the next month so the grid is always a full rectangle. Each cell carries
 * a boolean `inMonth` so the out-of-month days can be rendered greyed out.
 *
 * Week starts on Sunday (to match the screenshot's "Su Mo Tu We Th Fr Sa").
 */
function buildMonthGrid(
  year: number,
  month: number,
): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay(); // 0 = Sunday … 6 = Saturday
  const gridStart = addDays(firstOfMonth, -firstWeekday);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Preset shortcut definitions
// ---------------------------------------------------------------------------

/**
 * Returns {from, to} Date objects for a given preset key. "today" is normalized
 * to local midnight (00:00:00.000) so comparisons against the calendar grid
 * work cleanly.
 */
function computeShortcut(key: string): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (key) {
    case "today":
      return { from: today, to: today };

    case "week": {
      // Week = Sunday of this week → today (matches the Sunday-start grid)
      const sunday = addDays(today, -today.getDay());
      return { from: sunday, to: today };
    }

    case "month":
      return { from: startOfMonth(today), to: today };

    case "last30":
      // "Last 30 days" = inclusive window of today plus the previous 29
      return { from: addDays(today, -29), to: today };

    case "lastMonth": {
      // Last month's full range (1st → last day)
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0); // day 0 of this month = last day of previous month
      return { from: lastMonthStart, to: lastMonthEnd };
    }

    case "quarter": {
      // Start of the current calendar quarter (Jan/Apr/Jul/Oct) → today
      const q = Math.floor(today.getMonth() / 3);
      return { from: new Date(today.getFullYear(), q * 3, 1), to: today };
    }

    case "ytd":
      // Year to date: Jan 1 of this year → today
      return { from: new Date(today.getFullYear(), 0, 1), to: today };

    default:
      return { from: today, to: today };
  }
}

/** Ordered list of preset shortcuts shown in the right sidebar. */
const SHORTCUTS: { key: string; label: string }[] = [
  { key: "today",     label: "Today" },
  { key: "week",      label: "This week" },
  { key: "month",     label: "This month" },
  { key: "last30",    label: "Last 30 days" },
  { key: "lastMonth", label: "Last month" },
  { key: "quarter",   label: "This quarter" },
  { key: "ytd",       label: "YTD (year to date)" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  /** Initial ?from= param from the URL, or undefined if "All time". */
  initialFrom?: string;
  /** Initial ?to= param from the URL, or undefined if "All time". */
  initialTo?: string;
}

/**
 * DateRangePicker — client component rendered inside the dashboard header.
 *
 * The "committed" state (what's reflected in the URL) lives entirely in props.
 * The "uncommitted" state (what the user is currently picking inside the open
 * panel) lives in local React state and is discarded when the panel closes
 * without a full selection.
 */
export default function DateRangePicker({ initialFrom, initialTo }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Derive committed Date objects from the string props (null if absent).
  // These drive the BUTTON LABEL and the panel's starting anchor.
  const committedFrom = initialFrom ? fromISODate(initialFrom) : null;
  const committedTo   = initialTo   ? fromISODate(initialTo)   : null;

  // Panel open/close state + click-outside ref
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Uncommitted selection (used while the panel is open)
  const [selFrom, setSelFrom] = useState<Date | null>(committedFrom);
  const [selTo,   setSelTo]   = useState<Date | null>(committedTo);
  const [hovered, setHovered] = useState<Date | null>(null);

  // Which month the LEFT calendar is showing. The right calendar is always
  // leftAnchor + 1 month. Initial anchor: the committed `from`, or today.
  const [leftAnchor, setLeftAnchor] = useState<Date>(() =>
    startOfMonth(committedFrom ?? new Date()),
  );

  // Every time the panel opens, re-sync local state to whatever is currently
  // committed in the URL. This matters when the user closes the panel without
  // committing (half-picked state) and then reopens it — they should see the
  // last committed range, not their abandoned selection.
  useEffect(() => {
    if (open) {
      setSelFrom(committedFrom);
      setSelTo(committedTo);
      setHovered(null);
      setLeftAnchor(startOfMonth(committedFrom ?? new Date()));
    }
    // committedFrom/committedTo are derived from props on every render —
    // intentionally omitted from deps so we only re-sync on open, not on every
    // parent re-render (which would fight the user's in-panel selection).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Click-outside-to-close. Uses mousedown so the panel closes BEFORE any
  // click handler on the outside target fires (prevents double-triggers).
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  /**
   * Write the given from/to pair to the URL. Both nulls = clear the range.
   * Wrapped in startTransition so the dropdown stays visually stable during
   * the server navigation (prevents a flash).
   */
  function commit(from: Date | null, to: Date | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", toISODate(from)); else params.delete("from");
    if (to)   params.set("to",   toISODate(to));   else params.delete("to");
    params.delete("period"); // legacy param — always dropped when the new picker commits
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  /**
   * Handle a click on a day cell inside either calendar.
   *
   * State machine:
   *   - No from yet OR both from+to set → treat as new start; clear `to`.
   *   - from set, no to → finalize range:
   *       * if click < from → swap so the earlier date becomes `from`
   *       * commit both dates to the URL, close the panel
   */
  function onDayClick(d: Date) {
    if (!selFrom || (selFrom && selTo)) {
      setSelFrom(d);
      setSelTo(null);
      return;
    }
    // Second click — finalize the range
    if (d < selFrom) {
      // Clicked earlier than current `from` → swap
      setSelFrom(d);
      setSelTo(selFrom);
      commit(d, selFrom);
    } else {
      setSelTo(d);
      commit(selFrom, d);
    }
    setOpen(false);
  }

  /** Apply a preset shortcut and close the panel. */
  function applyShortcut(key: string) {
    const { from, to } = computeShortcut(key);
    setSelFrom(from);
    setSelTo(to);
    commit(from, to);
    setOpen(false);
  }

  /** Clear the range and close the panel (used by the X button in the trigger). */
  function clearRange() {
    setSelFrom(null);
    setSelTo(null);
    commit(null, null);
    setOpen(false);
  }

  // ---------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------

  /** Label shown inside the trigger button. */
  const buttonLabel =
    committedFrom && committedTo
      ? `${formatShortDate(committedFrom)} - ${formatShortDate(committedTo)}`
      : committedFrom
        ? `${formatShortDate(committedFrom)} -  …`
        : "All time";

  /** Is a range currently committed? (controls whether the X button shows.) */
  const hasRange = !!committedFrom || !!committedTo;

  // Right calendar = left calendar + 1 month
  const rightAnchor = addMonths(leftAnchor, 1);

  return (
    <div ref={containerRef} className="relative">
      {/* ------------------------------------------------------------------
          Trigger button — mirrors the Tradezella UI:
            [calendar icon]  Jan 11, 2026 - Jan 17, 2026  (X)  (▾)
         ------------------------------------------------------------------ */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-700 border border-gray-200
                   bg-white rounded-lg pl-3 pr-2 py-2 hover:bg-gray-50 transition"
      >
        {/* Calendar icon */}
        <svg
          className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>

        {/* Range label */}
        <span className="whitespace-nowrap font-medium">{buttonLabel}</span>

        {/* X clear button — only shown when a range is committed. Uses a <span>
            with role="button" so it doesn't nest a <button> inside the trigger
            (invalid HTML). stopPropagation prevents the outer toggle. */}
        {hasRange && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date range"
            onClick={(e) => {
              e.stopPropagation();
              clearRange();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                clearRange();
              }
            }}
            className="ml-1 w-4 h-4 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
          >
            <svg
              className="w-2.5 h-2.5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}

        {/* Chevron — flips 180° when the panel is open */}
        <svg
          className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ------------------------------------------------------------------
          Open panel — two calendars + shortcut sidebar
         ------------------------------------------------------------------ */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200
                     rounded-xl shadow-xl z-50 overflow-hidden flex"
        >
          {/* Left side: header summary + two-month calendar grid */}
          <div className="p-4">
            {/* Date summary row: "January 11, 2026 → January 17, 2026" */}
            <div className="flex items-center justify-center gap-6 mb-4 text-sm font-semibold text-gray-800">
              <span className="min-w-[130px] text-center">
                {selFrom ? formatFullDate(selFrom) : <span className="text-gray-400">Start date</span>}
              </span>
              <span className="text-gray-300">→</span>
              <span className="min-w-[130px] text-center">
                {selTo
                  ? formatFullDate(selTo)
                  : hovered && selFrom && !selTo
                    ? formatFullDate(hovered)
                    : <span className="text-gray-400">End date</span>}
              </span>
            </div>

            {/* Two side-by-side month views */}
            <div className="flex gap-6">
              <MonthView
                anchor={leftAnchor}
                selFrom={selFrom}
                selTo={selTo}
                hovered={hovered}
                onDayClick={onDayClick}
                onDayHover={setHovered}
                showPrev
                onPrev={() => setLeftAnchor(addMonths(leftAnchor, -1))}
                onNext={() => setLeftAnchor(addMonths(leftAnchor, 1))}
                onMonthChange={(m) =>
                  setLeftAnchor(new Date(leftAnchor.getFullYear(), m, 1))
                }
                onYearChange={(y) =>
                  setLeftAnchor(new Date(y, leftAnchor.getMonth(), 1))
                }
              />
              <MonthView
                anchor={rightAnchor}
                selFrom={selFrom}
                selTo={selTo}
                hovered={hovered}
                onDayClick={onDayClick}
                onDayHover={setHovered}
                showNext
                onPrev={() => setLeftAnchor(addMonths(leftAnchor, -1))}
                onNext={() => setLeftAnchor(addMonths(leftAnchor, 1))}
                onMonthChange={(m) =>
                  // The right view represents leftAnchor + 1; changing its
                  // month must shift the leftAnchor back by 1 so the right
                  // view lands on the selected month.
                  setLeftAnchor(addMonths(new Date(rightAnchor.getFullYear(), m, 1), -1))
                }
                onYearChange={(y) =>
                  setLeftAnchor(addMonths(new Date(y, rightAnchor.getMonth(), 1), -1))
                }
              />
            </div>
          </div>

          {/* Right side: preset shortcuts */}
          <div className="border-l border-gray-100 py-3 w-44 flex flex-col">
            {SHORTCUTS.map((s) => (
              <button
                key={s.key}
                onClick={() => applyShortcut(s.key)}
                className="text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthView — renders a single month of the calendar grid
// ---------------------------------------------------------------------------

interface MonthViewProps {
  anchor: Date;
  selFrom: Date | null;
  selTo: Date | null;
  hovered: Date | null;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date | null) => void;
  /** Render the left-arrow "previous month" button in the header. */
  showPrev?: boolean;
  /** Render the right-arrow "next month" button in the header. */
  showNext?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onMonthChange: (monthIndex: number) => void;
  onYearChange: (year: number) => void;
}

/**
 * Single-month calendar grid. Handles its own header (with month + year
 * dropdowns and optional prev/next arrows) and renders the 42-cell day grid
 * with range highlighting.
 */
function MonthView({
  anchor, selFrom, selTo, hovered,
  onDayClick, onDayHover,
  showPrev, showNext,
  onPrev, onNext,
  onMonthChange, onYearChange,
}: MonthViewProps) {
  const year  = anchor.getFullYear();
  const month = anchor.getMonth();
  const cells = buildMonthGrid(year, month);

  // Weekday header — Sunday-start to match Tradezella
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Year dropdown range: current year ± 10. Enough for trading history without
  // flooding the <select>. Can be widened later if someone complains.
  const years = Array.from({ length: 21 }, (_, i) => year - 10 + i);

  /**
   * Returns true if a date falls BETWEEN the committed endpoints (exclusive
   * of the endpoints themselves — those get rendered as filled circles).
   * While the user is mid-selection (selTo is null), `hovered` acts as the
   * temporary end anchor so the range preview updates as they move the mouse.
   */
  function isInRange(d: Date): boolean {
    if (!selFrom) return false;
    const end = selTo ?? hovered;
    if (!end) return false;
    const lo = selFrom < end ? selFrom : end;
    const hi = selFrom < end ? end : selFrom;
    // Strict inequality so the endpoints don't double-render as both circle + band
    return d > lo && d < hi;
  }

  return (
    <div className="w-[220px]">
      {/* Header: [<] Month ▾ Year ▾ [>] */}
      <div className="flex items-center justify-between mb-2 px-1 h-6">
        {showPrev ? (
          <button
            onClick={onPrev}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Previous month"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          // Placeholder keeps the header centered even when the arrow is hidden
          <span className="w-6" />
        )}

        <div className="flex items-center gap-1 text-xs font-semibold text-gray-700">
          {/* Month dropdown — native <select> styled minimally */}
          <select
            value={month}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className="bg-transparent cursor-pointer hover:text-indigo-600 focus:outline-none pr-1"
          >
            {MONTHS_SHORT.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          {/* Year dropdown */}
          <select
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="bg-transparent cursor-pointer hover:text-indigo-600 focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {showNext ? (
          <button
            onClick={onNext}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Next month"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-6" />
        )}
      </div>

      {/* Weekday labels row */}
      <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium mb-1">
        {weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* 6 × 7 day grid. Each cell is a relative container so we can layer:
             - a range-band background (behind the circle)
             - the day number as a circular button (on top)
          The range band is rendered as a full-width rectangle that visually
          connects across cells; the circles sit on top of it for selected
          endpoints. */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isFrom = !!selFrom && sameDay(cell.date, selFrom);
          const isTo   = !!selTo   && sameDay(cell.date, selTo);
          const isEndpoint = isFrom || isTo;
          const inBand = isInRange(cell.date);

          // Band edge shaping: the cell that is the start endpoint gets a
          // band only on its right half (so the band "grows out" toward the
          // next day); the end endpoint gets a band only on its left half.
          // This creates the illusion of a continuous pill from start to end
          // even though each cell is a discrete grid child.
          const isHoverEnd =
            !selTo && hovered && selFrom && sameDay(cell.date, hovered);
          const endpointOfPreview = isFrom || isHoverEnd;

          return (
            <div
              key={i}
              className="relative h-8 flex items-center justify-center"
            >
              {/* Band behind the circle. Four cases:
                    1. In-band cell → full-width band.
                    2. Start endpoint with a known end → right-half band.
                    3. End endpoint → left-half band.
                    4. Neither → no band. */}
              {inBand && <div className="absolute inset-0 bg-indigo-50" />}
              {isFrom && (selTo || isHoverEnd) && !sameDay(selFrom!, selTo ?? hovered!) && (
                <div className="absolute top-0 bottom-0 right-0 left-1/2 bg-indigo-50" />
              )}
              {(isTo || (isHoverEnd && !isFrom)) && selFrom && !sameDay(selFrom, selTo ?? hovered!) && (
                <div className="absolute top-0 bottom-0 left-0 right-1/2 bg-indigo-50" />
              )}

              {/* The day button itself */}
              <button
                onClick={() => onDayClick(cell.date)}
                onMouseEnter={() => onDayHover(cell.date)}
                onMouseLeave={() => onDayHover(null)}
                className={`
                  relative z-10 h-7 w-7 flex items-center justify-center text-xs rounded-full transition
                  ${!cell.inMonth ? "text-gray-300" : "text-gray-700"}
                  ${isEndpoint ? "bg-indigo-600 text-white font-semibold shadow-sm" : ""}
                  ${!isEndpoint && !inBand ? "hover:bg-gray-100" : ""}
                  ${!isEndpoint && inBand ? "text-indigo-700" : ""}
                `}
              >
                {cell.date.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
