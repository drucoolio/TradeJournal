/**
 * components/day-view/DayViewToolbar.tsx — Top filter bar for the Day View page.
 *
 * Contains:
 *   - Day/Week mode toggle
 *   - Date range picker (quick ranges: week, month, 3M, YTD, all)
 *   - Account multi-select filter
 *   - "Start my day" button → opens DailyJournal modal (for today)
 */

"use client";

type Mode = "day" | "week";
type Range = "week" | "month" | "3months" | "ytd" | "all";

interface AccountOpt {
  id: string;
  login: number;
  name: string;
}

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  range: Range;
  onRangeChange: (r: Range) => void;
  accounts: AccountOpt[];
  selectedAccountIds: string[];
  onAccountsChange: (ids: string[]) => void;
  onStartMyDay: () => void;
}

const RANGE_OPTS: { value: Range; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "3months", label: "Last 3 months" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All time" },
];

export default function DayViewToolbar({
  mode,
  onModeChange,
  range,
  onRangeChange,
  accounts,
  selectedAccountIds,
  onAccountsChange,
  onStartMyDay,
}: Props) {
  const allSelected = selectedAccountIds.length === 0 || selectedAccountIds.length === accounts.length;

  function toggleAccount(id: string) {
    if (selectedAccountIds.includes(id)) {
      onAccountsChange(selectedAccountIds.filter((x) => x !== id));
    } else {
      onAccountsChange([...selectedAccountIds, id]);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-3 bg-white border-b border-gray-200">
      <div className="flex items-center gap-3">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
          <button
            onClick={() => onModeChange("day")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition ${
              mode === "day" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => onModeChange("week")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition ${
              mode === "week" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Week
          </button>
        </div>

        {/* Range picker */}
        <select
          value={range}
          onChange={(e) => onRangeChange(e.target.value as Range)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white
                     focus:outline-none focus:border-indigo-400"
        >
          {RANGE_OPTS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Accounts dropdown — simple summary button + inline checkboxes */}
        {accounts.length > 1 && (
          <details className="relative">
            <summary className="list-none text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 cursor-pointer hover:bg-gray-50">
              {allSelected
                ? `All accounts (${accounts.length})`
                : `${selectedAccountIds.length} selected`}
            </summary>
            <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[220px]">
              {accounts.map((a) => {
                const checked =
                  selectedAccountIds.length === 0 || selectedAccountIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccount(a.id)}
                    />
                    <span className="truncate">
                      {a.name} <span className="text-gray-400">#{a.login}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        )}
      </div>

      {/* Start my day button */}
      <button
        onClick={onStartMyDay}
        className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Start my day
      </button>
    </div>
  );
}
