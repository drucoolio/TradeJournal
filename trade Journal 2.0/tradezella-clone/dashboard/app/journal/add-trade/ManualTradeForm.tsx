/**
 * app/journal/add-trade/ManualTradeForm.tsx — Manual Trade Entry form (Client Component).
 *
 * A comprehensive form for manually entering trades with all essential fields:
 *
 *   REQUIRED FIELDS:
 *     - Account (which account this trade belongs to)
 *     - Symbol (e.g. EURUSD, XAUUSD)
 *     - Direction (Buy / Sell)
 *     - Lot size
 *     - Open price + Close price
 *     - Open time + Close time
 *
 *   OPTIONAL FIELDS:
 *     - Stop loss + Take profit
 *     - Commission + Swap
 *     - Strategy (playbook link)
 *     - Tags (for categorization)
 *     - Notes + Trade thesis
 *     - Confidence level (1-5)
 *
 * The form auto-calculates P&L, pips, and duration on the server side
 * via POST /api/trades. After successful creation, the user is redirected
 * back to the journal overview.
 *
 * DESIGN NOTES:
 *   - Form layout matches the Tradezella manual entry design
 *   - Fields are grouped logically: Trade Details → Pricing → Timing → Journal
 *   - Common symbols are shown as quick-select buttons for faster entry
 *   - Validation happens both client-side (required fields) and server-side
 *
 * RELATED FILES:
 *   - page.tsx — Server Component providing accounts/playbooks/tags data
 *   - /api/trades/route.ts — POST endpoint that processes the trade
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Props received from the Server Component. */
interface ManualTradeFormProps {
  accounts: { id: string; login: number; name: string; broker: string; currency: string }[];
  playbooks: { id: string; name: string }[];
  tags: { id: string; name: string; color: string; category: string }[];
}

/** Common forex pairs and instruments for the quick-select buttons. */
const COMMON_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "XAUUSD", "XAGUSD", "US30", "NAS100", "SPX500",
];

export default function ManualTradeForm({ accounts, playbooks, tags }: ManualTradeFormProps) {
  const router = useRouter();

  // ─── Form State ───────────────────────────────────────────────────
  const [accountId, setAccountId]     = useState(accounts[0]?.id ?? "");
  const [symbol, setSymbol]           = useState("");
  const [direction, setDirection]     = useState<"buy" | "sell">("buy");
  const [lotSize, setLotSize]         = useState("");
  const [openPrice, setOpenPrice]     = useState("");
  const [closePrice, setClosePrice]   = useState("");
  const [openTime, setOpenTime]       = useState("");
  const [closeTime, setCloseTime]     = useState("");
  const [sl, setSl]                   = useState("");
  const [tp, setTp]                   = useState("");
  const [commission, setCommission]   = useState("");
  const [swap, setSwap]               = useState("");
  const [playbookId, setPlaybookId]   = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes]             = useState("");
  const [tradeThesis, setTradeThesis] = useState("");
  const [confidence, setConfidence]   = useState<number>(0); // 0 = not set

  // ─── UI State ─────────────────────────────────────────────────────
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState(false);

  /**
   * Toggles a tag in the selectedTags array.
   * Tags are stored as name strings (matching the trades.tags[] column format).
   */
  function toggleTag(tagName: string) {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  }

  /**
   * Submits the manual trade to POST /api/trades.
   *
   * Validates required fields client-side before making the request.
   * On success, shows a brief success message then redirects to overview.
   */
  async function handleSubmit() {
    // Client-side validation for required fields
    if (!accountId)  return setError("Please select an account.");
    if (!symbol)     return setError("Symbol is required.");
    if (!lotSize)    return setError("Lot size is required.");
    if (!openPrice)  return setError("Open price is required.");
    if (!closePrice) return setError("Close price is required.");
    if (!openTime)   return setError("Open time is required.");
    if (!closeTime)  return setError("Close time is required.");

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id:   accountId,
          symbol:       symbol.toUpperCase(),
          direction,
          lot_size:     parseFloat(lotSize),
          open_price:   parseFloat(openPrice),
          close_price:  parseFloat(closePrice),
          open_time:    new Date(openTime).toISOString(),
          close_time:   new Date(closeTime).toISOString(),
          sl:           sl ? parseFloat(sl) : undefined,
          tp:           tp ? parseFloat(tp) : undefined,
          commission:   commission ? parseFloat(commission) : undefined,
          swap:         swap ? parseFloat(swap) : undefined,
          playbook_id:  playbookId || undefined,
          tags:         selectedTags.length > 0 ? selectedTags : undefined,
          notes:        notes.trim() || undefined,
          trade_thesis: tradeThesis.trim() || undefined,
          confidence:   confidence > 0 ? confidence : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create trade");

      // Show success, then redirect after a brief delay
      setSuccess(true);
      setTimeout(() => router.push("/overview"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Success State ────────────────────────────────────────────────
  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-8 text-center">
        <svg className="w-8 h-8 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <p className="text-green-800 font-medium">Trade added successfully!</p>
        <p className="text-green-600 text-sm mt-1">Redirecting to overview...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: Trade Details (Account, Symbol, Direction, Size)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Trade details</h3>

        {/* Account selector */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Account *</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.login}) — {a.broker}
              </option>
            ))}
          </select>
        </div>

        {/* Symbol — text input + quick-select buttons */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Symbol *</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. EURUSD"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition mb-2"
          />
          {/* Quick-select common symbols */}
          <div className="flex flex-wrap gap-1">
            {COMMON_SYMBOLS.map(s => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`text-[10px] px-2 py-1 rounded-lg border transition
                  ${symbol === s
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Direction + Lot Size — side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Direction toggle */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Direction *</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection("buy")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition
                  ${direction === "buy"
                    ? "bg-green-50 border-green-300 text-green-700"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
              >
                Buy (Long)
              </button>
              <button
                onClick={() => setDirection("sell")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition
                  ${direction === "sell"
                    ? "bg-red-50 border-red-300 text-red-700"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
              >
                Sell (Short)
              </button>
            </div>
          </div>

          {/* Lot size */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lot size *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              placeholder="e.g. 0.10"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: Pricing (Open, Close, SL, TP, Commission, Swap)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Pricing</h3>

        {/* Open + Close price */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Open price *</label>
            <input
              type="number"
              step="any"
              value={openPrice}
              onChange={(e) => setOpenPrice(e.target.value)}
              placeholder="e.g. 1.08500"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Close price *</label>
            <input
              type="number"
              step="any"
              value={closePrice}
              onChange={(e) => setClosePrice(e.target.value)}
              placeholder="e.g. 1.08700"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
        </div>

        {/* SL + TP (optional) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Stop loss</label>
            <input
              type="number"
              step="any"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Take profit</label>
            <input
              type="number"
              step="any"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
        </div>

        {/* Commission + Swap (optional) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Commission</label>
            <input
              type="number"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="e.g. -3.50"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Swap</label>
            <input
              type="number"
              step="0.01"
              value={swap}
              onChange={(e) => setSwap(e.target.value)}
              placeholder="e.g. -1.20"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: Timing (Open time, Close time)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Timing</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Open time *</label>
            <input
              type="datetime-local"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Close time *</label>
            <input
              type="datetime-local"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: Journal (Strategy, Tags, Notes, Thesis, Confidence)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Journal</h3>

        {/* Strategy (playbook) selector */}
        {playbooks.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Strategy (playbook)</label>
            <select
              value={playbookId}
              onChange={(e) => setPlaybookId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
            >
              <option value="">No strategy selected</option>
              {playbooks.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tags multi-select */}
        {tags.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.name)}
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
          </div>
        )}

        {/* Trade thesis */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Trade thesis</label>
          <textarea
            value={tradeThesis}
            onChange={(e) => setTradeThesis(e.target.value)}
            placeholder="Why did you take this trade? What was your plan?"
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes about this trade..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                       focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
          />
        </div>

        {/* Confidence level (1-5 star selector) */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Confidence level</label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                onClick={() => setConfidence(confidence === level ? 0 : level)}
                className="transition"
                title={`${level}/5`}
              >
                <svg
                  className={`w-6 h-6 ${level <= confidence ? "text-yellow-400" : "text-gray-200"}`}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
            {confidence > 0 && (
              <span className="text-xs text-gray-400 ml-2">{confidence}/5</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          Submit Button
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`text-sm font-medium px-5 py-2.5 rounded-lg transition
            ${!submitting
              ? "bg-indigo-600 hover:bg-indigo-500 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
        >
          {submitting ? "Adding trade\u2026" : "Add trade"}
        </button>
      </div>
    </div>
  );
}
