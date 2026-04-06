/**
 * app/trades/[id]/TradeDetail.tsx — Individual Trade Detail (Client Component).
 *
 * Full-page trade view matching Tradezella's layout:
 *
 *   TOP BAR:
 *     [≡] [<] [>] BTCUSD  Thu, Mar 26, 2026    [Mark as reviewed] [Replay] [Share]
 *
 *   LEFT PANEL (scrollable):
 *     Tabs: Stats | Strategy | Executions | Attachments
 *     Stats tab content:
 *       - Net P&L, Side, Account, Lots, Commissions, Swap
 *       - Net ROI, Gross P&L, Adjusted Cost
 *       - Strategy selector
 *       - Trade Rating (stars)
 *       - Profit Target / Stop Loss
 *       - Trade Risk, Planned R-Multiple, Realized R-Multiple
 *       - Average Entry, Average Exit, Entry Time, Exit Time
 *       - Setups selector, Mistakes selector, Custom Tags, Emotions, Trend
 *
 *   RIGHT PANEL:
 *     Tabs: Chart | Notes | Running P&L
 *     Chart tab: TradingView placeholder (empty for now, provision kept)
 *     Notes tab: Trade note + Daily Journal sub-tabs
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RichNoteEditor from "@/components/editor/RichNoteEditor";
import TemplatePickerMenu from "@/components/editor/TemplatePickerMenu";
import TemplateEditorModal from "@/components/templates/TemplateEditorModal";
import { emptyDoc } from "@/lib/editor/defaults";
import { extractPlainText, isEmptyDoc } from "@/lib/editor/serialize";
import type { TipTapDoc, NoteKind } from "@/lib/editor/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TradeDetailProps {
  trade: any;
  account: { id: string; login: number; name: string; broker: string; currency: string };
  prevTradeId: string | null;
  nextTradeId: string | null;
  tags: { id: string; name: string; color: string; category: string }[];
  mistakes: { id: string; name: string; description: string | null }[];
  playbooks: { id: string; name: string }[];
  rules: { id: string; name: string }[];
  session: any | null;
}

export default function TradeDetail({
  trade, account, prevTradeId, nextTradeId,
  tags, mistakes, playbooks, rules, session,
}: TradeDetailProps) {
  const router = useRouter();

  // ─── Left Panel Tab State ─────────────────────────────────────────
  const [leftTab, setLeftTab] = useState<"stats" | "strategy" | "executions" | "attachments">("stats");

  // ─── Right Panel Tab State ────────────────────────────────────────
  const [rightTab, setRightTab] = useState<"chart" | "notes" | "running_pnl">("chart");
  const [notesTab, setNotesTab] = useState<"trade_note" | "daily_journal">("trade_note");

  // ─── Rich Notes State (Trade note tab) ────────────────────────────
  // The plain text `tradeNotes` below is kept in sync for legacy search
  // compatibility — the JSON AST is the source of truth.
  const [tradeNotesJson, setTradeNotesJson] = useState<TipTapDoc>(() => emptyDoc());
  const [tradeNotesHtml, setTradeNotesHtml] = useState<string>("<p></p>");
  const tradeDefaultAppliedRef = useRef<string | null>(null);

  // ─── Rich Notes State (Daily Journal tab) ─────────────────────────
  const [dailyNotesJson, setDailyNotesJson] = useState<TipTapDoc>(() => emptyDoc());
  const [dailyNotesHtml, setDailyNotesHtml] = useState<string>("<p></p>");
  const dailyDefaultAppliedRef = useRef<string | null>(null);

  // ─── Template modal (shared between both sub-tabs) ────────────────
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateModalKind, setTemplateModalKind] = useState<NoteKind>("trade");

  // ─── Editable Journal Fields ──────────────────────────────────────
  const [tradeNotes, setTradeNotes]         = useState(trade.notes ?? "");
  const [tradeThesis, setTradeThesis]       = useState(trade.trade_thesis ?? "");
  const [executionRating, setExecutionRating] = useState(trade.execution_rating ?? 0);
  const [playbookId, setPlaybookId]         = useState(trade.playbook_id ?? "");
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>(trade.mistake_ids ?? []);
  const [selectedTags, setSelectedTags]     = useState<string[]>(trade.tags ?? []);
  const [moodEntry, setMoodEntry]           = useState<string[]>(() => {
    const v = trade.mood_entry;
    if (!v) return [];
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [v]; } catch { return v ? [v] : []; }
  });
  const [moodExit, setMoodExit]             = useState<string[]>(() => {
    const v = trade.mood_exit;
    if (!v) return [];
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [v]; } catch { return v ? [v] : []; }
  });
  const [confidence, setConfidence]         = useState(trade.confidence ?? 0);
  const [plannedRr, setPlannedRr]           = useState(trade.planned_rr ? String(trade.planned_rr) : "");
  const [wentRight, setWentRight]           = useState(trade.went_right ?? "");
  const [wentWrong, setWentWrong]           = useState(trade.went_wrong ?? "");
  const [lessons, setLessons]               = useState(trade.lessons ?? "");

  // ─── Daily Journal Fields ─────────────────────────────────────────
  const [dailyNotes, setDailyNotes]               = useState(session?.notes ?? "");
  const [marketConditions, setMarketConditions]     = useState(session?.market_conditions ?? "");

  // ─── UI State ─────────────────────────────────────────────────────
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");

  // Hydrate trade-note rich state whenever the trade changes.
  useEffect(() => {
    const incomingJson = (trade.notes_json ?? null) as TipTapDoc | null;
    if (incomingJson) {
      setTradeNotesJson(incomingJson);
      setTradeNotesHtml(trade.notes_html ?? "");
      setTradeNotes(extractPlainText(incomingJson));
    } else if (trade.notes) {
      const doc: TipTapDoc = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: trade.notes }] }],
      };
      setTradeNotesJson(doc);
      setTradeNotesHtml(`<p>${String(trade.notes).replace(/</g, "&lt;")}</p>`);
    } else {
      setTradeNotesJson(emptyDoc());
      setTradeNotesHtml("<p></p>");
    }
    tradeDefaultAppliedRef.current = null; // re-arm default lookup for this trade
  }, [trade]);

  // Hydrate daily-journal rich state whenever the session changes.
  useEffect(() => {
    if (!session) {
      setDailyNotesJson(emptyDoc());
      setDailyNotesHtml("<p></p>");
      return;
    }
    const incomingJson = (session.notes_json ?? null) as TipTapDoc | null;
    if (incomingJson) {
      setDailyNotesJson(incomingJson);
      setDailyNotesHtml(session.notes_html ?? "");
      setDailyNotes(extractPlainText(incomingJson));
    } else if (session.notes) {
      const doc: TipTapDoc = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: session.notes }] }],
      };
      setDailyNotesJson(doc);
      setDailyNotesHtml(`<p>${String(session.notes).replace(/</g, "&lt;")}</p>`);
    } else {
      setDailyNotesJson(emptyDoc());
      setDailyNotesHtml("<p></p>");
    }
    dailyDefaultAppliedRef.current = null;
  }, [session]);

  // Auto-apply the user's default trade template on an empty trade note.
  useEffect(() => {
    if (!trade?.id) return;
    if (tradeDefaultAppliedRef.current === trade.id) return;
    if (!isEmptyDoc(tradeNotesJson)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/note-templates", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          templates: Array<{ id: string; content_json: TipTapDoc; content_html: string; is_default_trade: boolean }>;
        };
        const def = data.templates.find((t) => t.is_default_trade);
        if (!def || cancelled) return;
        if (!isEmptyDoc(tradeNotesJson)) return;
        tradeDefaultAppliedRef.current = trade.id;
        setTradeNotesJson(def.content_json);
        setTradeNotesHtml(def.content_html);
        setTradeNotes(extractPlainText(def.content_json));
      } catch {
        /* ignore — nicety, not critical */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id]);

  // Auto-apply the user's default journal template on an empty daily note.
  useEffect(() => {
    if (!session?.id) return;
    if (dailyDefaultAppliedRef.current === session.id) return;
    if (!isEmptyDoc(dailyNotesJson)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/note-templates", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          templates: Array<{ id: string; content_json: TipTapDoc; content_html: string; is_default_journal: boolean }>;
        };
        const def = data.templates.find((t) => t.is_default_journal);
        if (!def || cancelled) return;
        if (!isEmptyDoc(dailyNotesJson)) return;
        dailyDefaultAppliedRef.current = session.id;
        setDailyNotesJson(def.content_json);
        setDailyNotesHtml(def.content_html);
        setDailyNotes(extractPlainText(def.content_json));
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Reset form when trade changes
  useEffect(() => {
    setTradeNotes(trade.notes ?? "");
    setTradeThesis(trade.trade_thesis ?? "");
    setExecutionRating(trade.execution_rating ?? 0);
    setPlaybookId(trade.playbook_id ?? "");
    setSelectedMistakes(trade.mistake_ids ?? []);
    setSelectedTags(trade.tags ?? []);
    setMoodEntry(trade.mood_entry ?? "");
    setMoodExit(trade.mood_exit ?? "");
    setConfidence(trade.confidence ?? 0);
    setPlannedRr(trade.planned_rr ? String(trade.planned_rr) : "");
    setWentRight(trade.went_right ?? "");
    setWentWrong(trade.went_wrong ?? "");
    setLessons(trade.lessons ?? "");
    setSaved(false);
    setError("");
  }, [trade]);

  useEffect(() => {
    setDailyNotes(session?.notes ?? "");
    setMarketConditions(session?.market_conditions ?? "");
  }, [session]);

  // ─── Save Trade Journal ───────────────────────────────────────────
  const saveTrade = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/trades", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: trade.id,
          notes: tradeNotes.trim() || null,
          notes_json: isEmptyDoc(tradeNotesJson) ? null : tradeNotesJson,
          notes_html: isEmptyDoc(tradeNotesJson) ? null : tradeNotesHtml,
          trade_thesis: tradeThesis.trim() || null,
          execution_rating: executionRating > 0 ? executionRating : null,
          playbook_id: playbookId || null,
          mistake_ids: selectedMistakes,
          tags: selectedTags,
          mood_entry: moodEntry.length > 0 ? JSON.stringify(moodEntry) : null,
          mood_exit: moodExit.length > 0 ? JSON.stringify(moodExit) : null,
          confidence: confidence > 0 ? confidence : null,
          planned_rr: plannedRr ? parseFloat(plannedRr) : null,
          went_right: wentRight.trim() || null,
          went_wrong: wentWrong.trim() || null,
          lessons: lessons.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [trade, saving, tradeNotes, tradeNotesJson, tradeNotesHtml, tradeThesis,
      executionRating, playbookId, selectedMistakes, selectedTags, moodEntry,
      moodExit, confidence, plannedRr, wentRight, wentWrong, lessons]);

  // ─── Save Daily Journal ───────────────────────────────────────────
  const saveDaily = useCallback(async () => {
    if (!session || saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: session.id,
          notes: dailyNotes.trim() || null,
          notes_json: isEmptyDoc(dailyNotesJson) ? null : dailyNotesJson,
          notes_html: isEmptyDoc(dailyNotesJson) ? null : dailyNotesHtml,
          market_conditions: marketConditions.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [session, saving, dailyNotes, dailyNotesJson, dailyNotesHtml, marketConditions]);

  // ─── Derived Values ───────────────────────────────────────────────
  const pnl = trade.net_pnl ?? 0;
  const isWin = pnl > 0.5;
  const isLoss = pnl < -0.5;
  const side = trade.direction === "buy" ? "LONG" : "SHORT";
  const grossPnl = trade.pnl ?? 0;
  const commission = trade.commission ?? 0;
  const swap = trade.swap ?? 0;

  // Calculate R-Multiple if SL exists
  const tradeRisk = (trade.sl && trade.open_price)
    ? Math.abs(trade.open_price - trade.sl) * (trade.lot_size ?? 0) *
      (trade.symbol?.includes("XAU") ? 100 :
       trade.symbol?.includes("BTC") ? 1 :
       trade.symbol?.includes("JPY") ? 1000 : 100000)
    : null;

  const realizedR = tradeRisk && tradeRisk > 0 ? pnl / tradeRisk : null;

  const tradeDate = trade.close_time
    ? new Date(trade.close_time).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
      })
    : "—";

  const entryTime = trade.open_time
    ? new Date(trade.open_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--";

  const exitTime = trade.close_time
    ? new Date(trade.close_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--";

  // Mood options
  const MOODS = ["Calm", "Focused", "Confident", "Anxious", "Fearful", "Greedy", "Frustrated", "Euphoric", "Tired", "Neutral"];

  function toggleMood(list: string[], setList: (v: string[]) => void, mood: string) {
    setList(list.includes(mood) ? list.filter(m => m !== mood) : [...list, mood]);
  }

  // Group tags by category
  const setupTags   = tags.filter(t => t.category === "strategy");
  const emotionTags = tags.filter(t => t.category === "emotion");
  const customTags  = tags.filter(t => t.category === "custom" || !["strategy", "emotion", "mistake", "market_condition"].includes(t.category));

  function toggleTag(tagName: string) {
    setSelectedTags(prev => prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]);
  }

  function toggleMistake(mistakeId: string) {
    setSelectedMistakes(prev => prev.includes(mistakeId) ? prev.filter(id => id !== mistakeId) : [...prev, mistakeId]);
  }

  // ─── Tab Button Helper ────────────────────────────────────────────
  function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition
          ${active
            ? "bg-[#1b2236] text-white"
            : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════
          TOP BAR — Symbol, date, navigation, actions
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Back to trade list */}
          <Link href="/trades" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Link>

          {/* Prev / Next navigation */}
          <div className="flex items-center gap-1">
            {prevTradeId ? (
              <Link href={`/trades/${prevTradeId}`} className="text-gray-400 hover:text-gray-700 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            ) : (
              <span className="text-gray-200"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></span>
            )}
            {nextTradeId ? (
              <Link href={`/trades/${nextTradeId}`} className="text-gray-400 hover:text-gray-700 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <span className="text-gray-200"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></span>
            )}
          </div>

          {/* Symbol + Date */}
          <span className="text-base font-semibold text-gray-900">{trade.symbol}</span>
          <span className="text-sm text-gray-400">{tradeDate}</span>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Save status */}
          {error && <span className="text-xs text-red-500">{error}</span>}
          {saved && <span className="text-xs text-green-600">Saved!</span>}

          <button
            onClick={saveTrade}
            disabled={saving}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition
              ${!saving ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-gray-200 text-gray-400"}`}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MAIN CONTENT — Left panel + Right panel
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── LEFT PANEL (scrollable) ─────────────────────────────── */}
        <div className="w-[400px] flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          {/* Left panel tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-100">
            <TabBtn label="Stats" active={leftTab === "stats"} onClick={() => setLeftTab("stats")} />
            <TabBtn label="Strategy" active={leftTab === "strategy"} onClick={() => setLeftTab("strategy")} />
            <TabBtn label="Executions" active={leftTab === "executions"} onClick={() => setLeftTab("executions")} />
            <TabBtn label="Attachments" active={leftTab === "attachments"} onClick={() => setLeftTab("attachments")} />
          </div>

          <div className="px-4 py-4">
            {/* ═══ STATS TAB ═══════════════════════════════════════════ */}
            {leftTab === "stats" && (
              <div className="space-y-5">
                {/* Net P&L — hero stat */}
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Net P&L</p>
                  <p className={`text-2xl font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {pnl >= 0 ? "" : "-"}${Math.abs(pnl).toFixed(2)}
                  </p>
                </div>

                {/* Key stats grid */}
                <div className="space-y-2.5 text-sm">
                  <StatRow label="Side" value={<span className={side === "LONG" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{side}</span>} />
                  <StatRow label="Account" value={String(account.login)} />
                  <StatRow label="Cfds traded" value={String(trade.lot_size ?? 0)} />
                  <StatRow label="Commissions & Fees" value={`$${Math.abs(commission).toFixed(2)}`} />
                  <StatRow label="Total Swap" value={`$${swap.toFixed(2)}`} />
                  <StatRow label="Gross P&L" value={`${grossPnl >= 0 ? "" : "-"}$${Math.abs(grossPnl).toFixed(2)}`} />
                </div>

                <hr className="border-gray-100" />

                {/* Strategy selector */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-xs text-gray-400">Strategy</p>
                  </div>
                  <select
                    value={playbookId}
                    onChange={(e) => setPlaybookId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900
                               focus:outline-none focus:border-indigo-400 transition"
                  >
                    <option value="">Select Strategy</option>
                    {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Trade Rating */}
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Trade Rating</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} onClick={() => setExecutionRating(executionRating === i ? 0 : i)}>
                        <svg
                          className={`w-5 h-5 ${i <= executionRating ? "text-yellow-400" : "text-gray-200"}`}
                          fill="currentColor" viewBox="0 0 24 24"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* Profit Target */}
                <div>
                  <p className="text-xs text-green-600 font-medium mb-1">Profit Target</p>
                  <StatRow label="TP" value={trade.tp ? `$${trade.tp}` : "--"} />
                </div>

                {/* Stop Loss */}
                <div>
                  <p className="text-xs text-red-600 font-medium mb-1">Stop loss</p>
                  <StatRow label="SL" value={trade.sl ? `$${trade.sl}` : "--"} />
                </div>

                <hr className="border-gray-100" />

                {/* Risk & R-Multiples */}
                <div className="space-y-2.5 text-sm">
                  <StatRow label="Trade Risk" value={tradeRisk ? `-$${Math.abs(tradeRisk).toFixed(2)}` : "--"} />
                  <StatRow label="Planned R-Multiple" value={plannedRr ? `${plannedRr}R` : "--"} />
                  <StatRow label="Realized R-Multiple" value={realizedR ? `${realizedR.toFixed(2)}R` : "--"} />
                </div>

                <hr className="border-gray-100" />

                {/* Entry / Exit details */}
                <div className="space-y-2.5 text-sm">
                  <StatRow label="Average Entry" value={trade.open_price ? `$${trade.open_price}` : "--"} />
                  <StatRow label="Average Exit" value={trade.close_price ? `$${trade.close_price}` : "--"} />
                  <StatRow label="Entry Time" value={entryTime} />
                  <StatRow label="Exit Time" value={exitTime} />
                </div>

                <hr className="border-gray-100" />

                {/* ─── TAG SELECTORS ──────────────────────────────────── */}

                {/* Setups (strategy tags) */}
                <TagSection
                  label="Setups"
                  icon="strategy"
                  items={playbooks}
                  selected={playbookId ? [playbookId] : []}
                  onToggle={(id) => setPlaybookId(playbookId === id ? "" : id)}
                  mode="single"
                />

                {/* Mistakes */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-yellow-500 text-sm">&#9888;</span>
                    <p className="text-xs font-semibold text-gray-700">Mistakes</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mistakes.map(m => (
                      <button
                        key={m.id}
                        onClick={() => toggleMistake(m.id)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition
                          ${selectedMistakes.includes(m.id)
                            ? "bg-red-50 border-red-300 text-red-700 font-medium"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                          }`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Tags */}
                {customTags.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <p className="text-xs font-semibold text-gray-700">Custom Tags</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {customTags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.name)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition
                            ${selectedTags.includes(tag.name)
                              ? "text-white border-transparent font-medium"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                            }`}
                          style={selectedTags.includes(tag.name) ? { backgroundColor: tag.color } : undefined}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emotions */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <p className="text-xs font-semibold text-gray-700">Emotions</p>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Entry</label>
                      <div className="flex flex-wrap gap-1">
                        {MOODS.map(m => (
                          <button key={m} type="button"
                            onClick={() => toggleMood(moodEntry, setMoodEntry, m)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition
                              ${moodEntry.includes(m)
                                ? "bg-blue-100 border-blue-300 text-blue-700 font-medium"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Exit</label>
                      <div className="flex flex-wrap gap-1">
                        {MOODS.map(m => (
                          <button key={m} type="button"
                            onClick={() => toggleMood(moodExit, setMoodExit, m)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition
                              ${moodExit.includes(m)
                                ? "bg-blue-100 border-blue-300 text-blue-700 font-medium"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confidence */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Confidence</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} onClick={() => setConfidence(confidence === i ? 0 : i)}>
                        <svg className={`w-4 h-4 ${i <= confidence ? "text-indigo-500" : "text-gray-200"}`}
                          fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Planned R:R input */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Planned R-Multiple</p>
                  <input
                    type="number" step="0.1" value={plannedRr}
                    onChange={(e) => setPlannedRr(e.target.value)}
                    placeholder="e.g. 2.0"
                    className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition"
                  />
                </div>

                {/* Bottom padding for scroll */}
                <div className="h-8" />
              </div>
            )}

            {/* ═══ STRATEGY TAB ═════════════════════════════════════════ */}
            {leftTab === "strategy" && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Trade Thesis</p>
                  <textarea
                    value={tradeThesis}
                    onChange={(e) => setTradeThesis(e.target.value)}
                    placeholder="Why did you take this trade?"
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition resize-none"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">What went right</p>
                  <textarea
                    value={wentRight}
                    onChange={(e) => setWentRight(e.target.value)}
                    placeholder="Good decisions, correct reads..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition resize-none"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">What went wrong</p>
                  <textarea
                    value={wentWrong}
                    onChange={(e) => setWentWrong(e.target.value)}
                    placeholder="Mistakes, missed signals..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition resize-none"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Lessons learned</p>
                  <textarea
                    value={lessons}
                    onChange={(e) => setLessons(e.target.value)}
                    placeholder="Key takeaways..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition resize-none"
                  />
                </div>
              </div>
            )}

            {/* ═══ EXECUTIONS TAB ═══════════════════════════════════════ */}
            {leftTab === "executions" && (
              <div className="text-sm text-gray-400 py-8 text-center">
                <p>Execution details will show here</p>
                <p className="text-xs mt-1">Entry/exit deal pairs from MT5</p>
              </div>
            )}

            {/* ═══ ATTACHMENTS TAB ═════════════════════════════════════ */}
            {leftTab === "attachments" && (
              <div className="text-sm text-gray-400 py-8 text-center">
                <p>Screenshot attachments will show here</p>
                <p className="text-xs mt-1">Upload trade screenshots for review</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL ─────────────────────────────────────────── */}
        <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
          {/* Right panel tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
            <TabBtn label="Chart" active={rightTab === "chart"} onClick={() => setRightTab("chart")} />
            <TabBtn label="Notes" active={rightTab === "notes"} onClick={() => setRightTab("notes")} />
            <TabBtn label="Running P&L" active={rightTab === "running_pnl"} onClick={() => setRightTab("running_pnl")} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ═══ CHART TAB ═════════════════════════════════════════ */}
            {rightTab === "chart" && (
              <div className="h-full flex items-center justify-center">
                {/* TradingView chart placeholder — provision for future integration */}
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 4-8" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">TradingView Chart</p>
                  <p className="text-xs text-gray-400 mt-1">Chart integration coming soon</p>
                  <p className="text-[10px] text-gray-300 mt-2">{trade.symbol} | {entryTime} — {exitTime}</p>
                </div>
              </div>
            )}

            {/* ═══ NOTES TAB ═════════════════════════════════════════ */}
            {rightTab === "notes" && (
              <div className="p-5">
                <div className="flex items-center gap-1 mb-4">
                  <p className="text-sm font-semibold text-gray-900 mr-3">Notes</p>
                  {/* Trade note / Daily Journal sub-tabs */}
                  <button
                    onClick={() => setNotesTab("trade_note")}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition
                      ${notesTab === "trade_note"
                        ? "bg-gray-100 border-gray-300 text-gray-900 font-medium"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Trade note
                  </button>
                  <button
                    onClick={() => setNotesTab("daily_journal")}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition
                      ${notesTab === "daily_journal"
                        ? "bg-gray-100 border-gray-300 text-gray-900 font-medium"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Daily Journal
                  </button>
                </div>

                {/* Trade note content (rich editor) */}
                {notesTab === "trade_note" && (
                  <div>
                    <div className="mb-2 flex justify-end">
                      <TemplatePickerMenu
                        onApply={({ json, html }) => {
                          setTradeNotesJson(json);
                          setTradeNotesHtml(html);
                          setTradeNotes(extractPlainText(json));
                        }}
                        onManage={() => {
                          setTemplateModalKind("trade");
                          setTemplateModalOpen(true);
                        }}
                      />
                    </div>
                    <RichNoteEditor
                      value={tradeNotesJson}
                      onChange={({ json, html, text }) => {
                        setTradeNotesJson(json);
                        setTradeNotesHtml(html);
                        setTradeNotes(text);
                      }}
                      placeholder="Write your trade notes here…"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={saveTrade}
                        disabled={saving}
                        className="text-xs font-medium px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                      >
                        {saving ? "Saving..." : "Save note"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Daily Journal content */}
                {notesTab === "daily_journal" && (
                  <div>
                    {session ? (
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="block text-xs text-gray-500">Daily notes</label>
                            <TemplatePickerMenu
                              onApply={({ json, html }) => {
                                setDailyNotesJson(json);
                                setDailyNotesHtml(html);
                                setDailyNotes(extractPlainText(json));
                              }}
                              onManage={() => {
                                setTemplateModalKind("journal");
                                setTemplateModalOpen(true);
                              }}
                            />
                          </div>
                          <RichNoteEditor
                            value={dailyNotesJson}
                            onChange={({ json, html, text }) => {
                              setDailyNotesJson(json);
                              setDailyNotesHtml(html);
                              setDailyNotes(text);
                            }}
                            placeholder="End of day reflections…"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={saveDaily}
                            disabled={saving}
                            className="text-xs font-medium px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                          >
                            {saving ? "Saving..." : "Save daily journal"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 py-8 text-center">
                        No session found for this trade&apos;s date.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══ RUNNING P&L TAB ═══════════════════════════════════ */}
            {rightTab === "running_pnl" && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-gray-500 font-medium">Running P&L</p>
                  <p className="text-xs text-gray-400 mt-1">Intra-trade P&L chart coming soon</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template management modal — shared by both Trade note and Daily Journal sub-tabs. */}
      <TemplateEditorModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        kindContext={templateModalKind}
      />
    </div>
  );
}

/** Renders a label: value stat row for the left panel. */
function StatRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-900 font-medium">{value}</span>
    </div>
  );
}

/** Renders a tag section with label, colored icon, and selectable items. */
function TagSection({
  label, icon, items, selected, onToggle, mode,
}: {
  label: string;
  icon: string;
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
}) {
  if (items.length === 0) return null;

  const iconColors: Record<string, string> = {
    strategy: "bg-purple-500",
    mistake: "bg-yellow-500",
    custom: "bg-green-500",
    emotion: "bg-blue-500",
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${iconColors[icon] ?? "bg-gray-400"}`} />
        <p className="text-xs font-semibold text-gray-700">{label}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition
              ${selected.includes(item.id)
                ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
