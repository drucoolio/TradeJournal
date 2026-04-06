/**
 * components/journal/TradeJournalPanel.tsx — Per-Trade Journal Slide-out Panel.
 *
 * This is the heart of the trade journaling system. When a user clicks on a
 * trade row in the journal table, this panel slides in from the right side
 * and displays:
 *
 *   TOP: Trade summary (symbol, direction, P&L, times, prices)
 *   MIDDLE: Journal entry fields grouped into sections:
 *     - Pre-Trade Plan: thesis, confidence, planned R:R, strategy (playbook)
 *     - Post-Trade Review: execution rating, setup rating, went right/wrong, lessons
 *     - Psychology: mood at entry/exit, emotion notes
 *     - Tags & Mistakes: multi-select from user's libraries
 *     - Notes: freeform text
 *   BOTTOM: Save button with auto-save indicator
 *
 * DESIGN PHILOSOPHY:
 *   The panel is designed to be filled in across two sessions:
 *     1. PRE-TRADE: Before/during the trade → thesis, confidence, strategy
 *     2. POST-TRADE: After the trade closes → ratings, lessons, mistakes
 *   This mirrors professional trading journal workflows.
 *
 * ARCHITECTURE:
 *   - Receives a trade object + user's tags/mistakes/playbooks as props
 *   - All saves go through PUT /api/trades (journal fields only)
 *   - Debounced auto-save on text fields, immediate save on select/rating changes
 *   - Panel visibility controlled by parent via isOpen/onClose props
 *
 * RELATED FILES:
 *   - /api/trades/route.ts — PUT endpoint for journal field updates
 *   - /app/journal/page.tsx — parent page that renders the trades table
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import RichNoteEditor from "@/components/editor/RichNoteEditor";
import TemplatePickerMenu from "@/components/editor/TemplatePickerMenu";
import TemplateEditorModal from "@/components/templates/TemplateEditorModal";
import { emptyDoc } from "@/lib/editor/defaults";
import { extractPlainText, isEmptyDoc } from "@/lib/editor/serialize";
import type { TipTapDoc } from "@/lib/editor/types";

/** Trade object shape (matches DbTrade from lib/db.ts + new journal columns). */
interface Trade {
  id: string;
  symbol: string;
  direction: "buy" | "sell";
  lot_size: number;
  open_price: number | null;
  close_price: number | null;
  sl: number | null;
  tp: number | null;
  open_time: string | null;
  close_time: string | null;
  duration_minutes: number | null;
  pnl: number;
  pnl_pips: number | null;
  net_pnl: number;
  commission: number;
  swap: number;
  source?: string;
  // Journal fields
  tags: string[];
  notes: string | null;
  notes_json?: unknown | null;  // TipTap JSON AST for the rich notes editor
  notes_html?: string | null;   // HTML snapshot for read-only rendering
  trade_thesis: string | null;
  planned_rr: number | null;
  confidence: number | null;
  execution_rating: number | null;
  setup_rating: number | null;
  went_right: string | null;
  went_wrong: string | null;
  lessons: string | null;
  mood_entry: string | null;
  mood_exit: string | null;
  emotion_notes: string | null;
  playbook_id: string | null;
  mistake_ids: string[] | null;
}

/** Props for the slide-out panel. */
interface TradeJournalPanelProps {
  trade: Trade | null;          // null = panel hidden
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;        // callback after successful save (for parent refresh)
  // User's libraries for selectors
  tags: { id: string; name: string; color: string }[];
  mistakes: { id: string; name: string }[];
  playbooks: { id: string; name: string }[];
}

/** Mood options for the mood selector dropdowns. */
const MOOD_OPTIONS = [
  "Calm", "Focused", "Confident", "Anxious", "Fearful",
  "Greedy", "Frustrated", "Euphoric", "Tired", "Neutral",
];

export default function TradeJournalPanel({
  trade, isOpen, onClose, onSaved,
  tags, mistakes, playbooks,
}: TradeJournalPanelProps) {
  // ─── Journal Form State ───────────────────────────────────────────
  // Initialized from the trade object when it changes.
  const [tradeThesis, setTradeThesis]         = useState("");
  const [plannedRr, setPlannedRr]             = useState("");
  const [confidence, setConfidence]           = useState(0);
  const [executionRating, setExecutionRating] = useState(0);
  const [setupRating, setSetupRating]         = useState(0);
  const [wentRight, setWentRight]             = useState("");
  const [wentWrong, setWentWrong]             = useState("");
  const [lessons, setLessons]                 = useState("");
  const [moodEntry, setMoodEntry]             = useState("");
  const [moodExit, setMoodExit]               = useState("");
  const [emotionNotes, setEmotionNotes]       = useState("");
  const [selectedTags, setSelectedTags]       = useState<string[]>([]);
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [playbookId, setPlaybookId]           = useState("");
  // Rich notes state — plain text is kept in sync so the legacy `notes`
  // column stays populated for search compatibility.
  const [notesJson, setNotesJson]             = useState<TipTapDoc>(() => emptyDoc());
  const [notesHtml, setNotesHtml]             = useState<string>("<p></p>");
  const [notesText, setNotesText]             = useState<string>("");
  const defaultAppliedRef = useRef<string | null>(null); // tracks per-trade "default applied" to avoid repeats
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // ─── UI State ─────────────────────────────────────────────────────
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");

  /**
   * Initialize form fields from the trade object whenever a new trade is selected.
   * This runs when the trade prop changes (user clicks a different trade row).
   */
  useEffect(() => {
    if (!trade) return;
    setTradeThesis(trade.trade_thesis ?? "");
    setPlannedRr(trade.planned_rr ? String(trade.planned_rr) : "");
    setConfidence(trade.confidence ?? 0);
    setExecutionRating(trade.execution_rating ?? 0);
    setSetupRating(trade.setup_rating ?? 0);
    setWentRight(trade.went_right ?? "");
    setWentWrong(trade.went_wrong ?? "");
    setLessons(trade.lessons ?? "");
    setMoodEntry(trade.mood_entry ?? "");
    setMoodExit(trade.mood_exit ?? "");
    setEmotionNotes(trade.emotion_notes ?? "");
    setSelectedTags(trade.tags ?? []);
    setSelectedMistakes(trade.mistake_ids ?? []);
    setPlaybookId(trade.playbook_id ?? "");
    // Initialise rich notes: prefer the JSON AST, fall back to legacy plain
    // text wrapped in a single paragraph, or an empty doc.
    const incomingJson = (trade.notes_json ?? null) as TipTapDoc | null;
    if (incomingJson) {
      setNotesJson(incomingJson);
      setNotesHtml(trade.notes_html ?? "");
      setNotesText(extractPlainText(incomingJson));
    } else if (trade.notes) {
      const doc: TipTapDoc = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: trade.notes }] }],
      };
      setNotesJson(doc);
      setNotesHtml(`<p>${trade.notes.replace(/</g, "&lt;")}</p>`);
      setNotesText(trade.notes);
    } else {
      setNotesJson(emptyDoc());
      setNotesHtml("<p></p>");
      setNotesText("");
    }
    defaultAppliedRef.current = null; // re-allow default template for the new trade
    setSaved(false);
    setError("");
  }, [trade]);

  /**
   * Auto-apply the user's default trade template when:
   *   - a trade is opened
   *   - the notes doc is empty
   *   - we haven't already applied for this trade
   * The default template lookup lives in useTemplates; we make a one-shot
   * fetch here so this panel doesn't have to wrap every render in the hook.
   */
  useEffect(() => {
    if (!trade) return;
    if (defaultAppliedRef.current === trade.id) return;
    if (!isEmptyDoc(notesJson)) return;
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
        // Only apply if still empty (user may have typed meanwhile)
        if (!isEmptyDoc(notesJson)) return;
        defaultAppliedRef.current = trade.id;
        setNotesJson(def.content_json);
        setNotesHtml(def.content_html);
        setNotesText(extractPlainText(def.content_json));
      } catch {
        /* ignore — default-on-empty is a nicety, not critical */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id]);

  /**
   * Saves all journal fields to the server via PUT /api/trades.
   *
   * Uses the journal fields whitelist on the API side, so only
   * journal-relevant fields are updated — core trade data is immutable.
   */
  const handleSave = useCallback(async () => {
    if (!trade || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/trades", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:               trade.id,
          trade_thesis:     tradeThesis.trim() || null,
          planned_rr:       plannedRr ? parseFloat(plannedRr) : null,
          confidence:       confidence > 0 ? confidence : null,
          execution_rating: executionRating > 0 ? executionRating : null,
          setup_rating:     setupRating > 0 ? setupRating : null,
          went_right:       wentRight.trim() || null,
          went_wrong:       wentWrong.trim() || null,
          lessons:          lessons.trim() || null,
          mood_entry:       moodEntry || null,
          mood_exit:        moodExit || null,
          emotion_notes:    emotionNotes.trim() || null,
          tags:             selectedTags,
          mistake_ids:      selectedMistakes,
          playbook_id:      playbookId || null,
          notes:            notesText.trim() || null, // legacy plain-text column
          notes_json:       isEmptyDoc(notesJson) ? null : notesJson,
          notes_html:       isEmptyDoc(notesJson) ? null : notesHtml,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      setSaved(true);
      onSaved?.();
      // Clear the "saved" indicator after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    trade, saving, tradeThesis, plannedRr, confidence,
    executionRating, setupRating, wentRight, wentWrong, lessons,
    moodEntry, moodExit, emotionNotes, selectedTags, selectedMistakes,
    playbookId, notesJson, notesHtml, notesText, onSaved,
  ]);

  // Don't render anything if the panel is closed or no trade is selected
  if (!isOpen || !trade) return null;

  return (
    <>
      {/* ─── Backdrop overlay ──────────────────────────────────────── */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* ─── Slide-out Panel ───────────────────────────────────────── */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-50
                      overflow-y-auto border-l border-gray-200">
        {/* ─── Panel Header: Trade Summary ─────────────────────────── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {/* Symbol + Direction badge */}
              <span className="text-lg font-semibold text-gray-900">{trade.symbol}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded
                ${trade.direction === "buy"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
                }`}>
                {trade.direction.toUpperCase()}
              </span>
              {/* Manual trade indicator */}
              {trade.source === "manual" && (
                <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">Manual</span>
              )}
            </div>

            {/* Close button */}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Trade metrics row */}
          <div className="flex items-center gap-4 text-xs">
            <span className={`font-semibold ${trade.net_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {trade.net_pnl >= 0 ? "+" : ""}${trade.net_pnl.toFixed(2)}
            </span>
            {trade.pnl_pips !== null && (
              <span className="text-gray-500">
                {trade.pnl_pips >= 0 ? "+" : ""}{trade.pnl_pips.toFixed(1)} pips
              </span>
            )}
            <span className="text-gray-400">{trade.lot_size} lots</span>
            {trade.duration_minutes !== null && (
              <span className="text-gray-400">
                {trade.duration_minutes < 60
                  ? `${trade.duration_minutes}m`
                  : `${Math.floor(trade.duration_minutes / 60)}h ${trade.duration_minutes % 60}m`
                }
              </span>
            )}
          </div>
        </div>

        {/* ─── Panel Body: Journal Sections ────────────────────────── */}
        <div className="px-5 py-4 space-y-6">

          {/* ═══ PRE-TRADE PLAN ═══════════════════════════════════════ */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Pre-trade plan
            </h4>

            {/* Trade thesis */}
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Trade thesis</label>
              <textarea
                value={tradeThesis}
                onChange={(e) => setTradeThesis(e.target.value)}
                placeholder="Why did you take this trade?"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                           focus:outline-none focus:border-indigo-400 transition resize-none"
              />
            </div>

            {/* Strategy + Planned R:R + Confidence */}
            <div className="grid grid-cols-3 gap-3">
              {/* Strategy selector */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Strategy</label>
                <select
                  value={playbookId}
                  onChange={(e) => setPlaybookId(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900
                             focus:outline-none focus:border-indigo-400 transition"
                >
                  <option value="">None</option>
                  {playbooks.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Planned R:R */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Planned R:R</label>
                <input
                  type="number"
                  step="0.1"
                  value={plannedRr}
                  onChange={(e) => setPlannedRr(e.target.value)}
                  placeholder="e.g. 2.0"
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900
                             focus:outline-none focus:border-indigo-400 transition"
                />
              </div>

              {/* Confidence (1-5 stars) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Confidence</label>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setConfidence(confidence === level ? 0 : level)}
                    >
                      <svg
                        className={`w-4 h-4 ${level <= confidence ? "text-yellow-400" : "text-gray-200"}`}
                        fill="currentColor" viewBox="0 0 24 24"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ═══ POST-TRADE REVIEW ════════════════════════════════════ */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Post-trade review
            </h4>

            {/* Execution + Setup ratings */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Execution rating</label>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setExecutionRating(executionRating === level ? 0 : level)}
                    >
                      <svg
                        className={`w-4 h-4 ${level <= executionRating ? "text-indigo-500" : "text-gray-200"}`}
                        fill="currentColor" viewBox="0 0 24 24"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Setup rating</label>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setSetupRating(setupRating === level ? 0 : level)}
                    >
                      <svg
                        className={`w-4 h-4 ${level <= setupRating ? "text-indigo-500" : "text-gray-200"}`}
                        fill="currentColor" viewBox="0 0 24 24"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* What went right / wrong */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">What went right</label>
                <textarea
                  value={wentRight}
                  onChange={(e) => setWentRight(e.target.value)}
                  placeholder="Good decisions, correct reads..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900
                             focus:outline-none focus:border-indigo-400 transition resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">What went wrong</label>
                <textarea
                  value={wentWrong}
                  onChange={(e) => setWentWrong(e.target.value)}
                  placeholder="Mistakes, missed signals..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900
                             focus:outline-none focus:border-indigo-400 transition resize-none"
                />
              </div>
            </div>

            {/* Lessons learned */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Lessons learned</label>
              <textarea
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                placeholder="Key takeaways from this trade..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900
                           focus:outline-none focus:border-indigo-400 transition resize-none"
              />
            </div>
          </section>

          {/* ═══ PSYCHOLOGY ════════════════════════════════════════════ */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Psychology
            </h4>

            {/* Mood at entry / exit */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mood at entry</label>
                <select
                  value={moodEntry}
                  onChange={(e) => setMoodEntry(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900
                             focus:outline-none focus:border-indigo-400 transition"
                >
                  <option value="">Select mood</option>
                  {MOOD_OPTIONS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mood at exit</label>
                <select
                  value={moodExit}
                  onChange={(e) => setMoodExit(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-900
                             focus:outline-none focus:border-indigo-400 transition"
                >
                  <option value="">Select mood</option>
                  {MOOD_OPTIONS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Emotion notes */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Emotion notes</label>
              <textarea
                value={emotionNotes}
                onChange={(e) => setEmotionNotes(e.target.value)}
                placeholder="How did your emotions affect this trade?"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900
                           focus:outline-none focus:border-indigo-400 transition resize-none"
              />
            </div>
          </section>

          {/* ═══ TAGS ═════════════════════════════════════════════════ */}
          {tags.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setSelectedTags(prev =>
                        prev.includes(tag.name)
                          ? prev.filter(t => t !== tag.name)
                          : [...prev, tag.name]
                      );
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition
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
            </section>
          )}

          {/* ═══ MISTAKES ═════════════════════════════════════════════ */}
          {mistakes.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Mistakes
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {mistakes.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMistakes(prev =>
                        prev.includes(m.id)
                          ? prev.filter(id => id !== m.id)
                          : [...prev, m.id]
                      );
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition
                      ${selectedMistakes.includes(m.id)
                        ? "bg-red-50 border-red-300 text-red-700 font-medium"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ═══ NOTES (rich text) ════════════════════════════════════ */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Notes
              </h4>
              <TemplatePickerMenu
                onApply={({ json, html }) => {
                  setNotesJson(json);
                  setNotesHtml(html);
                  setNotesText(extractPlainText(json));
                }}
                onManage={() => setTemplateModalOpen(true)}
              />
            </div>
            <div className="rich-notes-scope">
              <RichNoteEditor
                value={notesJson}
                onChange={({ json, html, text }) => {
                  setNotesJson(json);
                  setNotesHtml(html);
                  setNotesText(text);
                }}
                placeholder="Any additional notes about this trade…"
              />
            </div>
          </section>
        </div>

        {/* ─── Panel Footer: Save Button ───────────────────────────── */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3
                        flex items-center justify-between">
          {/* Error / Saved indicator */}
          <div className="text-xs">
            {error && <span className="text-red-500">{error}</span>}
            {saved && <span className="text-green-600">Saved!</span>}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition
              ${!saving
                ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
          >
            {saving ? "Saving\u2026" : "Save journal"}
          </button>
        </div>
      </div>

      {/* Template management modal — rendered on demand from the picker */}
      <TemplateEditorModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        kindContext="trade"
      />
    </>
  );
}
