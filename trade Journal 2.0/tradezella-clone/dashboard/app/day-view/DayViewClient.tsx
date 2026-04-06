/**
 * app/day-view/DayViewClient.tsx — Day View client orchestrator.
 *
 * Responsibilities:
 *   - Hold filter state (mode: day|week, range, selected accounts)
 *   - Filter trades + sessions, group by date (or by ISO week in week mode)
 *   - Compute per-day stats for each card
 *   - Manage expand/collapse set (most recent day expanded by default)
 *   - Handle "Start my day" modal + per-day "Add note" modal via DailyJournal
 *   - Render toolbar, scrolling day card stack, and sticky right calendar
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DbTrade, DbSession } from "@/lib/db";
import DayViewToolbar from "@/components/day-view/DayViewToolbar";
import DayViewCalendar from "@/components/day-view/DayViewCalendar";
import DayCard from "@/components/day-view/DayCard";
import DailyJournal from "@/components/journal/DailyJournal";

// ─── Types ───────────────────────────────────────────────────────────

type Mode = "day" | "week";
type Range = "week" | "month" | "3months" | "ytd" | "all";

interface AccountOpt {
  id: string;
  login: number;
  name: string;
  currency: string;
}

interface RuleData {
  id: string;
  name: string;
  description: string | null;
}

// Full session shape that DailyJournal expects (extends DbSession)
interface FullSession extends DbSession {
  market_conditions: string | null;
  went_well: string | null;
  went_poorly: string | null;
  takeaways: string | null;
  goals_tomorrow: string | null;
  day_rating: number | null;
  mood_morning: string | null;
  mood_midday: string | null;
  mood_close: string | null;
  rules_followed: string[] | null;
  rules_broken: string[] | null;
}

interface Props {
  trades: DbTrade[];
  accounts: AccountOpt[];
  sessions: DbSession[];
  rules: RuleData[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getRangeStart(range: Range): Date | null {
  const now = new Date();
  switch (range) {
    case "week": {
      const d = new Date(now);
      d.setDate(now.getDate() - now.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "3months": {
      const d = new Date(now);
      d.setMonth(now.getMonth() - 3);
      return d;
    }
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
    default:
      return null;
  }
}

/** Returns ISO week key for a date, e.g. "2026-W14" */
function isoWeekKey(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000));
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Returns Monday of the week containing the given date, YYYY-MM-DD. */
function weekMondayKey(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy.toISOString().slice(0, 10);
}

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

function computeStats(trades: DbTrade[]): DayStats {
  const winners = trades.filter((t) => t.net_pnl > 0);
  const losers = trades.filter((t) => t.net_pnl < 0);
  const grossPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const commissions = trades.reduce((s, t) => s + t.commission + t.swap, 0);
  const netPnl = trades.reduce((s, t) => s + t.net_pnl, 0);
  const grossWin = winners.reduce((s, t) => s + t.net_pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.net_pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? grossWin : 0) : grossWin / grossLoss;
  const winPct = trades.length ? (winners.length / trades.length) * 100 : 0;
  return {
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    grossPnl,
    commissions,
    netPnl,
    profitFactor,
    winPct,
  };
}

// ─── Component ───────────────────────────────────────────────────────

export default function DayViewClient({ trades, accounts, sessions, rules }: Props) {
  // ?date=YYYY-MM-DD is set when the user clicks a cell in the dashboard
  // PnlCalendar. We read it once on mount (below) to auto-expand + scroll
  // to that day, mirroring the existing handleCalendarSelect behaviour.
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const [mode, setMode] = useState<Mode>("day");
  const [range, setRange] = useState<Range>("all");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Modal state
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalSession, setModalSession] = useState<FullSession | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Refs for scrollIntoView when calendar is clicked
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ─── Derived: filtered trades ────────────────────────────────────
  const filteredTrades = useMemo(() => {
    const rangeStart = getRangeStart(range);
    return trades.filter((t) => {
      if (!t.close_time) return false;
      if (selectedAccountIds.length > 0 && !selectedAccountIds.includes(t.account_id)) return false;
      if (rangeStart) {
        const closeDate = new Date(t.close_time);
        if (closeDate < rangeStart) return false;
      }
      return true;
    });
  }, [trades, range, selectedAccountIds]);

  // ─── Grouping by day or week ─────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, DbTrade[]>();
    for (const t of filteredTrades) {
      if (!t.close_time) continue;
      const d = new Date(t.close_time);
      const key = mode === "week" ? weekMondayKey(d) : d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    // Return sorted descending (newest first)
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, ts]) => ({ key, trades: ts, stats: computeStats(ts) }));
  }, [filteredTrades, mode]);

  // Calendar data — always by day regardless of mode
  const calendarData = useMemo(() => {
    const out: Record<string, { pnl: number; count: number }> = {};
    for (const t of filteredTrades) {
      if (!t.close_time) continue;
      const date = t.close_time.slice(0, 10);
      const prev = out[date] ?? { pnl: 0, count: 0 };
      out[date] = { pnl: prev.pnl + t.net_pnl, count: prev.count + 1 };
    }
    return out;
  }, [filteredTrades]);

  // Sessions lookup by date
  const sessionByDate = useMemo(() => {
    const map = new Map<string, DbSession>();
    for (const s of sessions) map.set(s.date, s);
    return map;
  }, [sessions]);

  // ─── Default expand state: most recent day expanded ──────────────
  useEffect(() => {
    if (groups.length > 0 && expandedKeys.size === 0) {
      // If the user arrived via ?date=YYYY-MM-DD (e.g. from the dashboard
      // PnlCalendar), prefer expanding that specific day over the default
      // "most recent" behaviour.
      const initialKey = dateParam && groups.some((g) => g.key === dateParam)
        ? dateParam
        : groups[0].key;
      setExpandedKeys(new Set([initialKey]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  // ─── ?date= param: auto-expand + scroll when arriving from calendar ──
  // Runs once per dateParam change. Uses the shared handleCalendarSelect
  // path below (defined later) so we share the same expand-and-scroll
  // logic with the in-page sidebar calendar.
  useEffect(() => {
    if (!dateParam) return;
    // Switch to day mode (in case user was last in week mode)
    if (mode === "week") setMode("day");
    setExpandedKeys((prev) => new Set(prev).add(dateParam));
    // Defer the scroll until after the card has mounted/laid out.
    const id = setTimeout(() => {
      const el = cardRefs.current[dateParam];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, groups.length]);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCalendarSelect(date: string) {
    // Switch to day mode if currently in week mode
    if (mode === "week") setMode("day");
    setExpandedKeys((prev) => new Set(prev).add(date));
    // Scroll the matching card into view
    setTimeout(() => {
      const el = cardRefs.current[date];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  // ─── Modal: open DailyJournal for a given date ───────────────────
  async function openJournalModal(date: string) {
    if (accounts.length === 0) return;
    setModalDate(date);
    setModalLoading(true);

    // Fetch existing session or create one
    try {
      const accountId = accounts[0].id;
      const res = await fetch(
        `/api/sessions?account_id=${encodeURIComponent(accountId)}&date=${date}`,
      );
      const data = await res.json();

      let session: FullSession | null = null;
      if (data.sessions && data.sessions.length > 0) {
        session = data.sessions[0] as FullSession;
      } else {
        // Create a blank session for this date
        const createRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            date,
            total_pnl: 0,
            trade_count: 0,
          }),
        });
        const created = await createRes.json();
        if (created.session) session = created.session as FullSession;
      }
      setModalSession(session);
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalDate(null);
    setModalSession(null);
  }

  function handleStartMyDay() {
    const today = new Date().toISOString().slice(0, 10);
    openJournalModal(today);
  }

  const currency = accounts[0]?.currency ?? "USD";

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Day View</h1>
      </header>

      {/* Toolbar */}
      <DayViewToolbar
        mode={mode}
        onModeChange={setMode}
        range={range}
        onRangeChange={setRange}
        accounts={accounts}
        selectedAccountIds={selectedAccountIds}
        onAccountsChange={setSelectedAccountIds}
        onStartMyDay={handleStartMyDay}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex gap-6">
          {/* Left: day cards */}
          <div className="flex-1 min-w-0 space-y-4">
            {groups.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
                <p className="text-gray-900 font-medium text-sm mb-1">No trading days to show</p>
                <p className="text-gray-400 text-xs">
                  Try expanding the date range or selecting different accounts.
                </p>
              </div>
            ) : (
              groups.map((g) => {
                const isWeekMode = mode === "week";
                const session = isWeekMode ? null : sessionByDate.get(g.key) ?? null;
                const displayKey = isWeekMode ? `Week of ${g.key}` : g.key;
                return (
                  <div
                    key={g.key}
                    ref={(el) => {
                      cardRefs.current[g.key] = el;
                    }}
                  >
                    <DayCard
                      date={isWeekMode ? g.key : g.key}
                      trades={g.trades}
                      session={session}
                      stats={g.stats}
                      expanded={expandedKeys.has(g.key)}
                      onToggle={() => toggleExpanded(g.key)}
                      onOpenJournal={openJournalModal}
                      currency={currency}
                    />
                    {/* Subtle label for week mode */}
                    {isWeekMode && (
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1 px-1">
                        {displayKey}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right: sticky calendar */}
          <div className="w-[280px] flex-shrink-0 hidden lg:block">
            <div className="sticky top-0">
              <DayViewCalendar
                data={calendarData}
                selectedDate={null}
                onSelectDate={handleCalendarSelect}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalDate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8"
          onClick={closeModal}
        >
          <div
            className="bg-[#f4f5f7] rounded-xl shadow-xl max-w-3xl w-full mx-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white rounded-t-xl">
              <h2 className="text-base font-semibold text-gray-900">Daily journal</h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {modalLoading && (
                <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
              )}
              {!modalLoading && modalSession && (
                <DailyJournal
                  session={modalSession}
                  rules={rules}
                  onSaved={() => {
                    // Session updated — could refetch, but keep it simple
                  }}
                />
              )}
              {!modalLoading && !modalSession && (
                <div className="text-center py-12 text-sm text-red-500">
                  Failed to load session.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
