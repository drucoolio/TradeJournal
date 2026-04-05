/**
 * components/journal/WeeklyReview.tsx — Weekly Review Journal Component.
 *
 * The highest-level journal entry. Completed once per trading week (typically
 * on Saturday/Sunday), this component enables deep reflection on the week's
 * trading performance and strategic planning for the next week.
 *
 * SECTIONS:
 *   1. WEEK OVERVIEW: Date range, total P&L, trade count, week rating
 *   2. GOALS REVIEW: Did you meet last week's goals? (dynamic list with checkboxes)
 *   3. TOP LESSONS: The most important things learned this week
 *   4. PATTERNS: Behavioral and market patterns noticed
 *   5. STRATEGY ADJUSTMENTS: What changes to make going forward
 *   6. NEXT WEEK'S GOALS: Specific, measurable goals for the coming week
 *   7. CONFIDENCE: How confident going into next week (1-5)
 *
 * GOALS REVIEW is a dynamic list — the user can add/remove goals and check
 * them off. Goals are stored as JSONB: [{ goal: string, met: boolean }].
 *
 * USAGE:
 *   <WeeklyReview
 *     review={existingReview}    // null for a new review
 *     weekStart="2026-03-30"     // Monday of the week
 *     weekEnd="2026-04-05"       // Sunday of the week
 *     accountId="uuid"           // optional
 *     weekPnl={1234.56}          // computed from trades
 *     weekTradeCount={15}        // computed from trades
 *     onSaved={() => refresh()}
 *   />
 *
 * RELATED FILES:
 *   - /api/weekly-reviews/route.ts — CRUD endpoint
 *   - 004_journal_system.sql — weekly_reviews table schema
 */

"use client";

import { useState, useEffect, useCallback } from "react";

/** Shape of a weekly review record. */
interface ReviewData {
  id: string;
  week_start: string;
  week_end: string;
  goals_met: { goal: string; met: boolean }[] | null;
  top_lessons: string | null;
  patterns: string | null;
  strategy_adjustments: string | null;
  goals_next_week: string | null;
  confidence: number | null;
  week_rating: number | null;
}

interface WeeklyReviewProps {
  review: ReviewData | null;   // null = creating a new review
  weekStart: string;           // "YYYY-MM-DD" (Monday)
  weekEnd: string;             // "YYYY-MM-DD" (Sunday)
  accountId?: string;          // optional — null for cross-account
  weekPnl?: number;            // computed from trades for display
  weekTradeCount?: number;     // computed from trades for display
  onSaved?: () => void;
}

export default function WeeklyReview({
  review, weekStart, weekEnd, accountId,
  weekPnl = 0, weekTradeCount = 0, onSaved,
}: WeeklyReviewProps) {
  // ─── Form State ───────────────────────────────────────────────────
  const [goalsMet, setGoalsMet]                     = useState<{ goal: string; met: boolean }[]>([]);
  const [topLessons, setTopLessons]                 = useState("");
  const [patterns, setPatterns]                     = useState("");
  const [strategyAdjustments, setStrategyAdjustments] = useState("");
  const [goalsNextWeek, setGoalsNextWeek]           = useState("");
  const [confidence, setConfidence]                 = useState(0);
  const [weekRating, setWeekRating]                 = useState(0);

  // ─── UI State ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");
  const [reviewId, setReviewId] = useState<string | null>(review?.id ?? null);

  /** Initialize form from existing review when it changes. */
  useEffect(() => {
    if (!review) return;
    setGoalsMet(review.goals_met ?? []);
    setTopLessons(review.top_lessons ?? "");
    setPatterns(review.patterns ?? "");
    setStrategyAdjustments(review.strategy_adjustments ?? "");
    setGoalsNextWeek(review.goals_next_week ?? "");
    setConfidence(review.confidence ?? 0);
    setWeekRating(review.week_rating ?? 0);
    setReviewId(review.id);
    setSaved(false);
    setError("");
  }, [review]);

  /** Adds a new empty goal to the goals list. */
  function addGoal() {
    setGoalsMet(prev => [...prev, { goal: "", met: false }]);
  }

  /** Updates a specific goal's text. */
  function updateGoalText(index: number, text: string) {
    setGoalsMet(prev => prev.map((g, i) => i === index ? { ...g, goal: text } : g));
  }

  /** Toggles a specific goal's met/unmet status. */
  function toggleGoalMet(index: number) {
    setGoalsMet(prev => prev.map((g, i) => i === index ? { ...g, met: !g.met } : g));
  }

  /** Removes a goal from the list. */
  function removeGoal(index: number) {
    setGoalsMet(prev => prev.filter((_, i) => i !== index));
  }

  /**
   * Saves the weekly review.
   *
   * If reviewId is null (new review), uses POST to create.
   * If reviewId exists (editing), uses PUT to update.
   */
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);

    // Filter out empty goals before saving
    const cleanGoals = goalsMet.filter(g => g.goal.trim());

    try {
      const payload = {
        ...(reviewId ? { id: reviewId } : {
          week_start: weekStart,
          week_end:   weekEnd,
          account_id: accountId || undefined,
        }),
        goals_met:            cleanGoals.length > 0 ? cleanGoals : null,
        top_lessons:          topLessons.trim() || null,
        patterns:             patterns.trim() || null,
        strategy_adjustments: strategyAdjustments.trim() || null,
        goals_next_week:      goalsNextWeek.trim() || null,
        confidence:           confidence > 0 ? confidence : null,
        week_rating:          weekRating > 0 ? weekRating : null,
      };

      const res = await fetch("/api/weekly-reviews", {
        method: reviewId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      // If this was a new review, capture the returned ID for future PUTs
      if (!reviewId && data.review?.id) {
        setReviewId(data.review.id);
      }

      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    reviewId, saving, weekStart, weekEnd, accountId,
    goalsMet, topLessons, patterns, strategyAdjustments,
    goalsNextWeek, confidence, weekRating, onSaved,
  ]);

  /**
   * Format the week date range for display.
   * Example: "Mar 30 — Apr 5, 2026"
   */
  const displayRange = (() => {
    const start = new Date(weekStart + "T12:00:00");
    const end   = new Date(weekEnd + "T12:00:00");
    const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr   = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${startStr} \u2014 ${endStr}`;
  })();

  return (
    <div className="space-y-6">
      {/* ─── Week Overview Header ────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Week of {displayRange}</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className={`font-semibold ${weekPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {weekPnl >= 0 ? "+" : ""}${weekPnl.toFixed(2)}
            </span>
            <span className="text-gray-400">{weekTradeCount} trades</span>
          </div>
        </div>

        {/* Week rating (1-5 stars) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Week rating:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setWeekRating(weekRating === level ? 0 : level)}
              >
                <svg
                  className={`w-5 h-5 ${level <= weekRating ? "text-yellow-400" : "text-gray-200"}`}
                  fill="currentColor" viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Goals Review ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Goals review</h3>
          <button
            onClick={addGoal}
            className="text-xs text-indigo-600 hover:text-indigo-500 font-medium transition"
          >
            + Add goal
          </button>
        </div>

        {goalsMet.length === 0 ? (
          <p className="text-xs text-gray-400">
            Add the goals you set last week to track whether you met them.
          </p>
        ) : (
          <div className="space-y-2">
            {goalsMet.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Met/unmet checkbox */}
                <button
                  onClick={() => toggleGoalMet(i)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition flex-shrink-0
                    ${g.met
                      ? "bg-green-500 border-green-500"
                      : "bg-white border-gray-300 hover:border-gray-400"
                    }`}
                >
                  {g.met && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Goal text input */}
                <input
                  type="text"
                  value={g.goal}
                  onChange={(e) => updateGoalText(i, e.target.value)}
                  placeholder="e.g. Stick to max 3 trades per day"
                  className={`flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm
                             focus:outline-none focus:border-indigo-400 transition
                             ${g.met ? "text-gray-400 line-through" : "text-gray-900"}`}
                />

                {/* Remove button */}
                <button
                  onClick={() => removeGoal(i)}
                  className="text-gray-300 hover:text-red-400 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Top Lessons ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top lessons this week</h3>
        <textarea
          value={topLessons}
          onChange={(e) => setTopLessons(e.target.value)}
          placeholder="What were the most important things you learned?"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition resize-none"
        />
      </div>

      {/* ─── Patterns ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Patterns noticed</h3>
        <textarea
          value={patterns}
          onChange={(e) => setPatterns(e.target.value)}
          placeholder="Any recurring behaviors, market patterns, or emotional tendencies?"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition resize-none"
        />
      </div>

      {/* ─── Strategy Adjustments ─────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Strategy adjustments</h3>
        <textarea
          value={strategyAdjustments}
          onChange={(e) => setStrategyAdjustments(e.target.value)}
          placeholder="What changes will you make to your approach next week?"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition resize-none"
        />
      </div>

      {/* ─── Next Week's Goals ────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Goals for next week</h3>
        <textarea
          value={goalsNextWeek}
          onChange={(e) => setGoalsNextWeek(e.target.value)}
          placeholder="Specific, measurable goals for the coming week..."
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:border-indigo-400 transition resize-none"
        />

        {/* Confidence going into next week */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Confidence for next week:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setConfidence(confidence === level ? 0 : level)}
              >
                <svg
                  className={`w-4 h-4 ${level <= confidence ? "text-indigo-500" : "text-gray-200"}`}
                  fill="currentColor" viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

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
          {saving ? "Saving\u2026" : reviewId ? "Save review" : "Create review"}
        </button>
      </div>
    </div>
  );
}
