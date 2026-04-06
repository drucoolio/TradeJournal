/**
 * components/journal/DailyJournal.tsx — Daily Session Journal Component.
 *
 * Renders the daily trading journal form for a specific session (trading day).
 * This is the "end of day" reflection tool where traders review their
 * performance and capture insights while they're fresh.
 *
 * SECTIONS:
 *   1. DAY OVERVIEW: Trading metrics summary (auto-computed from trades)
 *   2. MARKET CONDITIONS: What was the market doing today?
 *   3. RULES CHECKLIST: Which trading rules were followed/broken?
 *   4. MOOD TRACKER: Mood at morning, midday, and close
 *   5. REFLECTION: What went well, what went poorly, takeaways
 *   6. TOMORROW'S PLAN: Goals and intentions for tomorrow
 *   7. DAY RATING: 1-5 star rating for the overall day
 *   8. NOTES: Freeform text
 *
 * The rules checklist is the key differentiator — it connects to the
 * Rules Engine (6G) and stores which rules were followed/broken as
 * UUID arrays on the session record.
 *
 * USAGE:
 *   <DailyJournal
 *     session={sessionData}       // from GET /api/sessions?date=YYYY-MM-DD
 *     rules={activeRules}         // from GET /api/rules
 *     onSaved={() => refresh()}   // callback after save
 *   />
 *
 * RELATED FILES:
 *   - /api/sessions/route.ts — PUT endpoint for session updates
 *   - /api/rules/route.ts — GET endpoint for rules checklist
 *   - /app/journal/day/[date]/page.tsx — parent page (to be created)
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import RichNoteEditor from "@/components/editor/RichNoteEditor";
import TemplatePickerMenu from "@/components/editor/TemplatePickerMenu";
import TemplateEditorModal from "@/components/templates/TemplateEditorModal";
import { emptyDoc } from "@/lib/editor/defaults";
import { extractPlainText, isEmptyDoc } from "@/lib/editor/serialize";
import type { TipTapDoc } from "@/lib/editor/types";

/** Session data shape (matches expanded DbSession + journal columns). */
interface SessionData {
  id: string;
  account_id: string;
  date: string;
  total_pnl: number;
  trade_count: number;
  notes: string | null;
  notes_json?: unknown | null;  // TipTap JSON AST for rich notes
  notes_html?: string | null;   // HTML snapshot
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

/** Rule data shape for the checklist. */
interface RuleData {
  id: string;
  name: string;
  description: string | null;
}

interface DailyJournalProps {
  session: SessionData;
  rules: RuleData[];
  onSaved?: () => void;
}

/** Mood options consistent with the trade journal panel. */
const MOOD_OPTIONS = [
  "Calm", "Focused", "Confident", "Anxious", "Fearful",
  "Greedy", "Frustrated", "Euphoric", "Tired", "Neutral",
];

export default function DailyJournal({ session, rules, onSaved }: DailyJournalProps) {
  // ─── Form State ───────────────────────────────────────────────────
  const [marketConditions, setMarketConditions] = useState("");
  const [wentWell, setWentWell]                 = useState("");
  const [wentPoorly, setWentPoorly]             = useState("");
  const [takeaways, setTakeaways]               = useState("");
  const [goalsTomorrow, setGoalsTomorrow]       = useState("");
  const [dayRating, setDayRating]               = useState(0);
  const [moodMorning, setMoodMorning]           = useState("");
  const [moodMidday, setMoodMidday]             = useState("");
  const [moodClose, setMoodClose]               = useState("");
  const [rulesFollowed, setRulesFollowed]       = useState<string[]>([]);
  const [rulesBroken, setRulesBroken]           = useState<string[]>([]);
  // Rich notes state (TipTap JSON AST + HTML snapshot + plain-text projection)
  const [notesJson, setNotesJson]               = useState<TipTapDoc>(() => emptyDoc());
  const [notesHtml, setNotesHtml]               = useState<string>("<p></p>");
  const [notesText, setNotesText]               = useState<string>("");
  const defaultAppliedRef = useRef<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // ─── UI State ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");

  /** Initialize form from session data when session changes. */
  useEffect(() => {
    if (!session) return;
    setMarketConditions(session.market_conditions ?? "");
    setWentWell(session.went_well ?? "");
    setWentPoorly(session.went_poorly ?? "");
    setTakeaways(session.takeaways ?? "");
    setGoalsTomorrow(session.goals_tomorrow ?? "");
    setDayRating(session.day_rating ?? 0);
    setMoodMorning(session.mood_morning ?? "");
    setMoodMidday(session.mood_midday ?? "");
    setMoodClose(session.mood_close ?? "");
    setRulesFollowed(session.rules_followed ?? []);
    setRulesBroken(session.rules_broken ?? []);
    // Initialise rich notes from the session row.
    const incomingJson = (session.notes_json ?? null) as TipTapDoc | null;
    if (incomingJson) {
      setNotesJson(incomingJson);
      setNotesHtml(session.notes_html ?? "");
      setNotesText(extractPlainText(incomingJson));
    } else if (session.notes) {
      const doc: TipTapDoc = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: session.notes }] }],
      };
      setNotesJson(doc);
      setNotesHtml(`<p>${session.notes.replace(/</g, "&lt;")}</p>`);
      setNotesText(session.notes);
    } else {
      setNotesJson(emptyDoc());
      setNotesHtml("<p></p>");
      setNotesText("");
    }
    defaultAppliedRef.current = null;
    setSaved(false);
    setError("");
  }, [session]);

  /** Auto-apply user's default journal template when notes are empty. */
  useEffect(() => {
    if (!session) return;
    if (defaultAppliedRef.current === session.id) return;
    if (!isEmptyDoc(notesJson)) return;
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
        if (!isEmptyDoc(notesJson)) return;
        defaultAppliedRef.current = session.id;
        setNotesJson(def.content_json);
        setNotesHtml(def.content_html);
        setNotesText(extractPlainText(def.content_json));
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  /**
   * Toggles a rule between three states:
   *   - Not checked → Followed (added to rulesFollowed)
   *   - Followed → Broken (moved to rulesBroken)
   *   - Broken → Not checked (removed from both)
   *
   * This three-state toggle lets users quickly mark their rule compliance.
   */
  function toggleRule(ruleId: string) {
    if (rulesFollowed.includes(ruleId)) {
      // Currently followed → move to broken
      setRulesFollowed(prev => prev.filter(id => id !== ruleId));
      setRulesBroken(prev => [...prev, ruleId]);
    } else if (rulesBroken.includes(ruleId)) {
      // Currently broken → remove entirely (unset)
      setRulesBroken(prev => prev.filter(id => id !== ruleId));
    } else {
      // Currently unset → mark as followed
      setRulesFollowed(prev => [...prev, ruleId]);
    }
  }

  /**
   * Returns the status of a rule: "followed", "broken", or "unset".
   * Used to determine the visual state of the rule checkbox in the checklist.
   */
  function ruleStatus(ruleId: string): "followed" | "broken" | "unset" {
    if (rulesFollowed.includes(ruleId)) return "followed";
    if (rulesBroken.includes(ruleId))   return "broken";
    return "unset";
  }

  /**
   * Saves the daily journal entry via PUT /api/sessions.
   */
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:                session.id,
          market_conditions: marketConditions.trim() || null,
          went_well:         wentWell.trim() || null,
          went_poorly:       wentPoorly.trim() || null,
          takeaways:         takeaways.trim() || null,
          goals_tomorrow:    goalsTomorrow.trim() || null,
          day_rating:        dayRating > 0 ? dayRating : null,
          mood_morning:      moodMorning || null,
          mood_midday:       moodMidday || null,
          mood_close:        moodClose || null,
          rules_followed:    rulesFollowed,
          rules_broken:      rulesBroken,
          notes:             notesText.trim() || null,
          notes_json:        isEmptyDoc(notesJson) ? null : notesJson,
          notes_html:        isEmptyDoc(notesJson) ? null : notesHtml,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    session, saving, marketConditions, wentWell, wentPoorly,
    takeaways, goalsTomorrow, dayRating, moodMorning, moodMidday,
    moodClose, rulesFollowed, rulesBroken, notesJson, notesHtml, notesText, onSaved,
  ]);

  /**
   * Formats the session date for display (e.g., "Monday, April 5, 2026").
   */
  const displayDate = new Date(session.date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* ─── Day Overview Header ─────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">{displayDate}</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className={`font-semibold ${session.total_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {session.total_pnl >= 0 ? "+" : ""}${session.total_pnl.toFixed(2)}
            </span>
            <span className="text-gray-400">{session.trade_count} trades</span>
          </div>
        </div>

        {/* Day rating (1-5 stars) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Day rating:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setDayRating(dayRating === level ? 0 : level)}
              >
                <svg
                  className={`w-5 h-5 ${level <= dayRating ? "text-yellow-400" : "text-gray-200"}`}
                  fill="currentColor" viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Market Conditions ────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Market conditions</h3>
        <textarea
          value={marketConditions}
          onChange={(e) => setMarketConditions(e.target.value)}
          placeholder="What was the market doing today? Trending, ranging, volatile, news-driven?"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition resize-none"
        />
      </div>

      {/* ─── Rules Checklist ──────────────────────────────────────── */}
      {rules.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Rules checklist</h3>
          <p className="text-xs text-gray-400 mb-3">
            Click to cycle: unset → followed (green) → broken (red) → unset
          </p>
          <div className="space-y-1.5">
            {rules.map(rule => {
              const status = ruleStatus(rule.id);
              return (
                <button
                  key={rule.id}
                  onClick={() => toggleRule(rule.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition flex items-center gap-2.5
                    ${status === "followed"
                      ? "bg-green-50 border-green-200 text-green-800"
                      : status === "broken"
                        ? "bg-red-50 border-red-200 text-red-800"
                        : "bg-white border-gray-100 text-gray-700 hover:border-gray-200"
                    }`}
                >
                  {/* Status icon */}
                  {status === "followed" && (
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {status === "broken" && (
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {status === "unset" && (
                    <span className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0" />
                  )}

                  <span>{rule.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Mood Tracker ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Mood tracker</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Morning</label>
            <select
              value={moodMorning}
              onChange={(e) => setMoodMorning(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition"
            >
              <option value="">Select</option>
              {MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Midday</label>
            <select
              value={moodMidday}
              onChange={(e) => setMoodMidday(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition"
            >
              <option value="">Select</option>
              {MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Close</label>
            <select
              value={moodClose}
              onChange={(e) => setMoodClose(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition"
            >
              <option value="">Select</option>
              {MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ─── Reflection ───────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Reflection</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">What went well</label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder="Good decisions, discipline wins..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">What went poorly</label>
            <textarea
              value={wentPoorly}
              onChange={(e) => setWentPoorly(e.target.value)}
              placeholder="Mistakes, missed opportunities..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition resize-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Key takeaways</label>
          <textarea
            value={takeaways}
            onChange={(e) => setTakeaways(e.target.value)}
            placeholder="Most important lessons from today..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       focus:outline-none focus:border-indigo-400 transition resize-none"
          />
        </div>
      </div>

      {/* ─── Tomorrow's Plan ──────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Tomorrow&apos;s plan</h3>
        <textarea
          value={goalsTomorrow}
          onChange={(e) => setGoalsTomorrow(e.target.value)}
          placeholder="Goals, focus areas, specific setups to look for..."
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition resize-none"
        />
      </div>

      {/* ─── Notes (rich text) ────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
          <TemplatePickerMenu
            onApply={({ json, html }) => {
              setNotesJson(json);
              setNotesHtml(html);
              setNotesText(extractPlainText(json));
            }}
            onManage={() => setTemplateModalOpen(true)}
          />
        </div>
        <RichNoteEditor
          value={notesJson}
          onChange={({ json, html, text }) => {
            setNotesJson(json);
            setNotesHtml(html);
            setNotesText(text);
          }}
          placeholder="Any other thoughts about today…"
        />
      </div>

      {/* Template management modal */}
      <TemplateEditorModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        kindContext="journal"
      />

      {/* ─── Save Footer ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-2">
        <div className="text-xs">
          {error && <span className="text-red-500">{error}</span>}
          {saved && <span className="text-green-600">Saved!</span>}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`text-sm font-medium px-5 py-2.5 rounded-lg transition
            ${!saving
              ? "bg-indigo-600 hover:bg-indigo-500 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
        >
          {saving ? "Saving\u2026" : "Save daily journal"}
        </button>
      </div>
    </div>
  );
}
