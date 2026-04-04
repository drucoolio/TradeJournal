import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase";
import { getAdapter } from "@/lib/adapters";
import {
  getAccountsByUserId,
  getAccountByLogin,
  getTradesForAccounts,
} from "@/lib/db";
import type { BrokerAccount } from "@/lib/broker";
import type { DbTrade, DbAccount } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import SyncButton from "@/components/SyncButton";
import DashboardHeader from "@/components/DashboardHeader";
import CumulativePnlChart from "@/components/charts/CumulativePnlChart";
import DailyPnlChart from "@/components/charts/DailyPnlChart";
import PnlCalendar from "@/components/PnlCalendar";

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function getPeriodRange(period: string): { from?: string; to?: string } {
  const now  = new Date();
  const pad  = (n: number) => String(n).padStart(2, "0");
  const iso  = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (period) {
    case "week": {
      const from = new Date(now);
      from.setDate(now.getDate() - now.getDay()); // Sunday
      return { from: iso(from), to: iso(now) };
    }
    case "month": {
      return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: iso(now) };
    }
    case "3months": {
      const from = new Date(now);
      from.setMonth(now.getMonth() - 3);
      return { from: iso(from), to: iso(now) };
    }
    case "ytd": {
      return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
    }
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

function computeMetrics(trades: DbTrade[]) {
  if (trades.length === 0) {
    return {
      totalPnl: 0, tradeCount: 0,
      wins: 0, losses: 0,
      tradeWinPct: 0, profitFactor: 0,
      dayWinPct: 0, winDays: 0, lossDays: 0,
      avgWin: 0, avgLoss: 0, avgWinLossRatio: 0,
      dailyData: [] as { date: string; pnl: number; cumPnl: number }[],
      calendarData: {} as Record<string, { pnl: number; count: number }>,
    };
  }

  const wins   = trades.filter(t => t.net_pnl > 0);
  const losses = trades.filter(t => t.net_pnl < 0);

  const grossWin  = wins.reduce((s, t)   => s + t.net_pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0));

  const tradeWinPct    = (wins.length / trades.length) * 100;
  const profitFactor   = grossLoss === 0 ? 0 : grossWin / grossLoss;
  const avgWin         = wins.length   ? grossWin  / wins.length  : 0;
  const avgLoss        = losses.length ? grossLoss / losses.length : 0;
  const avgWinLossRatio = avgLoss === 0 ? 0 : avgWin / avgLoss;

  // Daily aggregation (trades are already sorted ascending by close_time)
  const byDate = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    if (!t.close_time) continue;
    const date = t.close_time.slice(0, 10);
    const prev = byDate.get(date) ?? { pnl: 0, count: 0 };
    byDate.set(date, { pnl: prev.pnl + t.net_pnl, count: prev.count + 1 });
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  let cumPnl = 0;
  const dailyData = sortedDates.map(date => {
    const d = byDate.get(date)!;
    cumPnl += d.pnl;
    return { date, pnl: d.pnl, cumPnl };
  });

  const calendarData: Record<string, { pnl: number; count: number }> = {};
  for (const [date, d] of Array.from(byDate.entries())) calendarData[date] = d;

  const tradingDays = Array.from(byDate.values());
  const winDays  = tradingDays.filter(d => d.pnl > 0).length;
  const lossDays = tradingDays.filter(d => d.pnl < 0).length;
  const dayWinPct = tradingDays.length ? (winDays / tradingDays.length) * 100 : 0;

  return {
    totalPnl: trades.reduce((s, t) => s + t.net_pnl, 0),
    tradeCount: trades.length,
    wins: wins.length, losses: losses.length,
    tradeWinPct, profitFactor,
    dayWinPct, winDays, lossDays,
    avgWin, avgLoss, avgWinLossRatio,
    dailyData, calendarData,
  };
}

// ---------------------------------------------------------------------------
// Display sub-components
// ---------------------------------------------------------------------------

function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(n);
}

function WinDonut({
  winPct, wins, losses,
}: { winPct: number; wins: number; losses: number }) {
  const r = 36, cx = 50, cy = 46;
  const circ   = Math.PI * r;
  const winArc = (winPct / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 52" className="w-24 h-12 -mb-1">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#f3f4f6" strokeWidth="10" strokeLinecap="round" />
        {winArc > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="#16c784" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${winArc} ${circ}`} />
        )}
        {winArc < circ && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="#ea3943" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${circ - winArc} ${circ}`}
            strokeDashoffset={-winArc} />
        )}
      </svg>
      <div className="flex gap-3 text-[10px]">
        <span className="text-green-500 font-medium">{wins}W</span>
        <span className="text-red-500 font-medium">{losses}L</span>
      </div>
    </div>
  );
}

function PfGauge({ value }: { value: number }) {
  const r = 28, circ = 2 * Math.PI * r;
  const fill  = Math.min(value / 3, 1);
  const color = value >= 1 ? "#16c784" : "#ea3943";
  return (
    <svg viewBox="0 0 72 72" className="w-14 h-14">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${fill * circ} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 36 36)" />
    </svg>
  );
}

function RatioBar({ avgWin, avgLoss }: { avgWin: number; avgLoss: number }) {
  const total  = avgWin + avgLoss;
  const winPct = total ? (avgWin / total) * 100 : 50;
  return (
    <div className="w-full mt-2">
      <div className="flex rounded-full overflow-hidden h-2 bg-gray-100">
        <div className="bg-green-400" style={{ width: `${winPct}%` }} />
        <div className="bg-red-400 flex-1" />
      </div>
      <div className="flex justify-between text-[10px] mt-1">
        <span className="text-green-500 font-medium">${avgWin.toFixed(0)}</span>
        <span className="text-red-500 font-medium">-${avgLoss.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

interface PageProps {
  // accounts: comma-separated MT5 login numbers e.g. "330000,420000"
  // Absent or empty = "All accounts" mode (no filter).
  // period: one of "week" | "month" | "3months" | "ytd" | "all" (absent = all)
  searchParams?: { accounts?: string; period?: string };
}

export default async function OverviewPage({ searchParams }: PageProps) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get("mt5_account")?.value;
  if (!raw) redirect("/settings/accounts");
  const account = JSON.parse(raw) as BrokerAccount;

  // Get logged-in user for multi-account lookup
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // ── All user accounts ─────────────────────────────────────────────────────
  const allAccounts: DbAccount[] = user
    ? await getAccountsByUserId(user.id)
    : [];

  // Fallback: ensure the currently active account is always in the list,
  // even if it was synced before Phase 3 (before user_id was added to accounts).
  if (!allAccounts.find(a => a.login === Number(account.login))) {
    const current = await getAccountByLogin(Number(account.login));
    if (current) allAccounts.unshift(current);
  }

  // ── Filter params ─────────────────────────────────────────────────────────
  const selectedPeriod = searchParams?.period ?? "all";
  const { from, to }   = getPeriodRange(selectedPeriod);

  // Parse the comma-separated ?accounts= param into an array of login strings.
  // Empty array = "All accounts" (no filter active).
  const accountsParam  = searchParams?.accounts ?? "";
  const selectedLogins: string[] = accountsParam
    ? accountsParam.split(",").filter(Boolean) // split "330000,420000" → ["330000", "420000"]
    : [];

  // Determine which accounts to query:
  //   No selection (empty) → query ALL user's accounts
  //   Specific logins      → filter to only those accounts
  const filteredAccounts =
    selectedLogins.length === 0
      ? allAccounts
      : allAccounts.filter(a => selectedLogins.includes(String(a.login)));

  const accountIds = filteredAccounts.map(a => a.id);

  // ── Data fetch ────────────────────────────────────────────────────────────
  const [positionsResult, trades] = await Promise.all([
    getAdapter(account.broker).getOpenPositions().catch(() => []),
    getTradesForAccounts(accountIds, from, to),
  ]);

  const openPositions = Array.isArray(positionsResult) ? positionsResult : [];
  const m = computeMetrics(trades);
  const hasTrades = trades.length > 0;

  const recentTrades = [...trades]
    .sort((a, b) => (b.close_time ?? "").localeCompare(a.close_time ?? ""))
    .slice(0, 10);

  const currency = filteredAccounts[0]?.currency ?? account.currency ?? "USD";

  return (
    <div className="flex h-screen bg-[#f4f5f7] overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center
                           justify-between flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-2">
            <SyncButton />
            <DashboardHeader
              accounts={allAccounts}
              selectedLogins={selectedLogins}
              currentPeriod={selectedPeriod}
            />
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {!hasTrades && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3
                            text-sm text-amber-700 flex items-center justify-between">
              <span>No trades found for this filter. Try <strong>All time</strong> or click <strong>Resync</strong>.</span>
            </div>
          )}

          {/* ── Metric cards ── */}
          <div className="grid grid-cols-5 gap-4">

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400 font-medium">Net P&L</p>
                <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                  {m.tradeCount}
                </span>
              </div>
              <p className={`text-2xl font-bold ${m.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {fmtMoney(m.totalPnl, currency)}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{currency} · {selectedPeriod === "all" ? "all time" : selectedPeriod}</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center">
              <p className="text-xs text-gray-400 font-medium self-start mb-2">Trade win %</p>
              <WinDonut winPct={m.tradeWinPct} wins={m.wins} losses={m.losses} />
              <p className="text-xl font-bold text-gray-800 mt-1">
                {m.tradeCount ? `${m.tradeWinPct.toFixed(2)}%` : "—"}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center">
              <p className="text-xs text-gray-400 font-medium self-start mb-2">Profit factor</p>
              <PfGauge value={m.profitFactor} />
              <p className="text-xl font-bold text-gray-800 mt-1">
                {m.profitFactor ? m.profitFactor.toFixed(2) : "—"}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center">
              <p className="text-xs text-gray-400 font-medium self-start mb-2">Day win %</p>
              <WinDonut winPct={m.dayWinPct} wins={m.winDays} losses={m.lossDays} />
              <p className="text-xl font-bold text-gray-800 mt-1">
                {m.tradeCount ? `${m.dayWinPct.toFixed(2)}%` : "—"}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 font-medium mb-1">Avg win/loss trade</p>
              <p className="text-xl font-bold text-gray-800">
                {m.avgWinLossRatio ? m.avgWinLossRatio.toFixed(2) : "—"}
              </p>
              {m.avgWin > 0 && <RatioBar avgWin={m.avgWin} avgLoss={m.avgLoss} />}
            </div>
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">Daily net cumulative P&L</p>
              {hasTrades
                ? <CumulativePnlChart data={m.dailyData} currency={currency} />
                : <div className="h-[180px] flex items-center justify-center text-sm text-gray-400">No data</div>
              }
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">Net daily P&L</p>
              {hasTrades
                ? <DailyPnlChart data={m.dailyData} />
                : <div className="h-[180px] flex items-center justify-center text-sm text-gray-400">No data</div>
              }
            </div>
          </div>

          {/* ── Recent trades + Calendar ── */}
          <div className="grid grid-cols-2 gap-4">

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex border-b border-gray-100 px-4 pt-4 gap-4">
                <span className="text-sm font-semibold text-gray-800 border-b-2 border-indigo-500 pb-2">
                  Recent trades
                </span>
                <span className="text-sm text-gray-400 pb-2">
                  Open positions
                  {openPositions.length > 0 && (
                    <span className="ml-1 text-xs bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5">
                      {openPositions.length}
                    </span>
                  )}
                </span>
              </div>
              {recentTrades.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-gray-400">No trades for this period</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-medium">Close Date</th>
                      <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                      <th className="text-right px-4 py-2.5 font-medium">Net P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentTrades.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {t.close_time
                            ? new Date(t.close_time).toLocaleDateString("en-US", {
                                month: "2-digit", day: "2-digit", year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{t.symbol}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${
                          t.net_pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {t.net_pnl >= 0 ? "+" : ""}${Math.abs(t.net_pnl).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <PnlCalendar data={m.calendarData} />
            </div>
          </div>

          {/* ── Open positions ── */}
          {openPositions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">
                  Open positions
                  <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 rounded-full px-2 py-0.5">
                    {openPositions.length}
                  </span>
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                    <th className="text-left px-4 py-2.5 font-medium">Dir</th>
                    <th className="text-right px-4 py-2.5 font-medium">Lots</th>
                    <th className="text-right px-4 py-2.5 font-medium">Open</th>
                    <th className="text-right px-4 py-2.5 font-medium">Current</th>
                    <th className="text-right px-4 py-2.5 font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {openPositions.map(pos => (
                    <tr key={pos.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{pos.symbol}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          pos.direction === "buy"
                            ? "bg-green-100 text-green-600"
                            : "bg-red-100 text-red-600"}`}>
                          {pos.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{pos.lot_size}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{pos.open_price}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{pos.current_price}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${
                        pos.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {pos.profit >= 0 ? "+" : ""}${Math.abs(pos.profit).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
