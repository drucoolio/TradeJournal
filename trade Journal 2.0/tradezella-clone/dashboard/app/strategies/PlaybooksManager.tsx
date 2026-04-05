/**
 * app/settings/playbooks/PlaybooksManager.tsx — Playbook CRUD manager (Client Component).
 *
 * Provides the full interactive UI for managing strategy playbooks:
 *   - Create new playbooks with rich detail fields (entry/exit rules,
 *     ideal conditions, timeframes, target R:R)
 *   - View playbooks as expandable cards showing all details
 *   - Edit playbooks in a full-form edit mode
 *   - Toggle active/inactive status (inactive playbooks don't appear
 *     in the trade journal's strategy picker but preserve historical links)
 *   - Delete playbooks permanently
 *
 * DESIGN NOTES:
 *   - Unlike Tags/Mistakes/Rules (which are simple name + description),
 *     playbooks have many fields and need a more detailed form layout
 *   - Playbook cards are expandable — collapsed view shows name + description,
 *     expanded view shows all strategy details
 *   - Timeframe selection uses multi-select checkboxes for standard MT5 timeframes
 *   - The form is designed to encourage detailed strategy documentation,
 *     which is the core value prop of a strategy-based trading journal
 *
 * ARCHITECTURE:
 *   - Receives initial data from the Server Component (page.tsx)
 *   - All mutations go through /api/playbooks (POST, PUT, DELETE)
 *   - Local state updated immediately, router.refresh() for cache sync
 *
 * RELATED FILES:
 *   - page.tsx — Server Component providing initialPlaybooks
 *   - /api/playbooks/route.ts — backend CRUD endpoints
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaybookData } from "@/lib/types";

/**
 * Standard trading timeframes matching MT5/TradingView conventions.
 * Used in the timeframe multi-select when creating/editing a playbook.
 */
const TIMEFRAMES = [
  { value: "M1",  label: "1m" },
  { value: "M5",  label: "5m" },
  { value: "M15", label: "15m" },
  { value: "M30", label: "30m" },
  { value: "H1",  label: "1H" },
  { value: "H4",  label: "4H" },
  { value: "D1",  label: "1D" },
  { value: "W1",  label: "1W" },
  { value: "MN",  label: "1M" },
];

export default function PlaybooksManager({ initialPlaybooks }: { initialPlaybooks: PlaybookData[] }) {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<PlaybookData[]>(initialPlaybooks);

  // ─── New Playbook Form State ──────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState("");

  // ─── View / Edit State ────────────────────────────────────────────
  // expandedId: which playbook card is expanded (null = all collapsed)
  // editId: which playbook is in edit mode (null = none)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editForm, setEditForm]     = useState(emptyForm());
  const [saving, setSaving]         = useState(false);

  /** Returns a blank form state object for the playbook creation/edit form. */
  function emptyForm() {
    return {
      name: "",
      description: "",
      entry_rules: "",
      exit_rules: "",
      ideal_conditions: "",
      timeframes: [] as string[],
      default_rr: "",
    };
  }

  /**
   * Toggles a timeframe in the given form's timeframes array.
   * Used by both the create and edit forms' timeframe checkboxes.
   */
  function toggleTimeframe(
    current: string[],
    tf: string,
    setter: (tfs: string[]) => void
  ) {
    if (current.includes(tf)) {
      setter(current.filter(t => t !== tf));
    } else {
      setter([...current, tf]);
    }
  }

  /**
   * Creates a new playbook via POST /api/playbooks.
   *
   * Validates name (required) and default_rr (if provided, must be a positive number).
   * On success, adds to local state and resets form.
   */
  async function handleCreate() {
    if (!form.name.trim() || creating) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:             form.name.trim(),
          description:      form.description.trim() || undefined,
          entry_rules:      form.entry_rules.trim() || undefined,
          exit_rules:       form.exit_rules.trim() || undefined,
          ideal_conditions: form.ideal_conditions.trim() || undefined,
          timeframes:       form.timeframes.length > 0 ? form.timeframes : undefined,
          default_rr:       form.default_rr ? parseFloat(form.default_rr) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create playbook");

      setPlaybooks(prev => [...prev, data.playbook]);
      setForm(emptyForm());
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Saves edits to an existing playbook via PUT /api/playbooks.
   * Sends all form fields — the API handles partial updates.
   */
  async function handleSaveEdit() {
    if (!editId || saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/playbooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:               editId,
          name:             editForm.name.trim(),
          description:      editForm.description.trim() || null,
          entry_rules:      editForm.entry_rules.trim() || null,
          exit_rules:       editForm.exit_rules.trim() || null,
          ideal_conditions: editForm.ideal_conditions.trim() || null,
          timeframes:       editForm.timeframes,
          default_rr:       editForm.default_rr ? parseFloat(editForm.default_rr) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update playbook");

      setPlaybooks(prev => prev.map(p => p.id === editId ? data.playbook : p));
      setEditId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Toggles a playbook's active/inactive status via PUT /api/playbooks.
   * Quick toggle — no need to enter full edit mode.
   */
  async function handleToggleActive(pb: PlaybookData) {
    setError("");
    try {
      const res = await fetch("/api/playbooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pb.id, is_active: !pb.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to toggle playbook");

      setPlaybooks(prev => prev.map(p => p.id === pb.id ? data.playbook : p));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /**
   * Deletes a playbook via DELETE /api/playbooks.
   *
   * Removes from local state immediately. The DB has ON DELETE SET NULL
   * on trades.playbook_id, so trade data is preserved — only the strategy
   * link is severed.
   */
  async function handleDelete(id: string) {
    setError("");
    try {
      const res = await fetch("/api/playbooks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete playbook");

      setPlaybooks(prev => prev.filter(p => p.id !== id));
      if (editId === id) setEditId(null);
      if (expandedId === id) setExpandedId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /**
   * Enters full-form edit mode for a playbook.
   * Populates the editForm with the playbook's current values.
   */
  function startEdit(pb: PlaybookData) {
    setEditId(pb.id);
    setExpandedId(pb.id); // ensure the card is expanded
    setEditForm({
      name:             pb.name,
      description:      pb.description ?? "",
      entry_rules:      pb.entry_rules ?? "",
      exit_rules:       pb.exit_rules ?? "",
      ideal_conditions: pb.ideal_conditions ?? "",
      timeframes:       pb.timeframes ?? [],
      default_rr:       pb.default_rr ? String(pb.default_rr) : "",
    });
    setError("");
  }

  // ─── Separate playbooks into active and inactive groups ───────────
  const active   = playbooks.filter(p => p.is_active);
  const inactive = playbooks.filter(p => !p.is_active);

  return (
    <div>
      {/* ─── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* ─── Create Playbook Button / Form ─────────────────────────── */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500
                     text-white text-xs font-medium px-3 py-1.5 rounded-lg transition mb-6"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New playbook
        </button>
      ) : (
        /* ─── New Playbook Creation Form ─────────────────────────── */
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
          {/* Strategy name — required */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Strategy name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bull Flag Breakout, London Open Scalp"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
              autoFocus
            />
          </div>

          {/* Description — brief overview of the strategy */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief overview of this strategy..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
            />
          </div>

          {/* Entry rules and Exit rules — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Entry rules</label>
              <textarea
                value={form.entry_rules}
                onChange={(e) => setForm({ ...form, entry_rules: e.target.value })}
                placeholder="When do I enter this trade?"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                           focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Exit rules</label>
              <textarea
                value={form.exit_rules}
                onChange={(e) => setForm({ ...form, exit_rules: e.target.value })}
                placeholder="When do I exit? TP / SL rules?"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                           focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
              />
            </div>
          </div>

          {/* Ideal conditions */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ideal market conditions</label>
            <textarea
              value={form.ideal_conditions}
              onChange={(e) => setForm({ ...form, ideal_conditions: e.target.value })}
              placeholder="What market environment works best for this setup?"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
            />
          </div>

          {/* Timeframes (multi-select checkboxes) + Default R:R */}
          <div className="flex items-start gap-6">
            {/* Timeframes */}
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1.5">Timeframes</label>
              <div className="flex flex-wrap gap-1.5">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => toggleTimeframe(form.timeframes, tf.value,
                      (tfs) => setForm({ ...form, timeframes: tfs }))}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition
                      ${form.timeframes.includes(tf.value)
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default R:R */}
            <div className="w-28">
              <label className="block text-xs text-gray-500 mb-1">Target R:R</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={form.default_rr}
                onChange={(e) => setForm({ ...form, default_rr: e.target.value })}
                placeholder="e.g. 2.0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                           focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setForm(emptyForm()); setError(""); }}
              className="text-xs text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || creating}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition
                ${form.name.trim() && !creating
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
            >
              {creating ? "Creating\u2026" : "Create playbook"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Playbooks List ────────────────────────────────────────── */}
      {playbooks.length === 0 && !showForm ? (
        /* Empty state */
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            {/* Book/strategy icon */}
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm mb-1">No playbooks yet</p>
          <p className="text-gray-500 text-xs">Create strategy playbooks to link trades to your setups</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ─── Active Playbooks ─────────────────────────────────── */}
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active ({active.length})
              </h3>
              <div className="space-y-2">
                {active.map(pb => renderPlaybookCard(pb))}
              </div>
            </div>
          )}

          {/* ─── Inactive Playbooks ───────────────────────────────── */}
          {inactive.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                Inactive ({inactive.length})
              </h3>
              <div className="space-y-2">
                {inactive.map(pb => renderPlaybookCard(pb))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  /**
   * Renders a single playbook card.
   *
   * The card has two modes:
   *   - Collapsed: shows name + description + action buttons
   *   - Expanded: shows all strategy details (entry/exit rules, conditions, etc.)
   *
   * When editId matches, the expanded section becomes an editable form.
   */
  function renderPlaybookCard(pb: PlaybookData) {
    const isExpanded = expandedId === pb.id;
    const isEditing  = editId === pb.id;

    return (
      <div
        key={pb.id}
        className={`bg-white border rounded-xl transition overflow-hidden
          ${isEditing ? "border-indigo-200" : "border-gray-100 hover:border-gray-200"}
          ${!pb.is_active ? "opacity-60" : ""}`}
      >
        {/* ─── Card Header (always visible) ────────────────────── */}
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer"
          onClick={() => {
            if (!isEditing) setExpandedId(isExpanded ? null : pb.id);
          }}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {/* Expand/collapse chevron */}
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>

            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900">{pb.name}</span>
              {pb.description && !isExpanded && (
                <p className="text-xs text-gray-400 truncate mt-0.5">{pb.description}</p>
              )}
            </div>
          </div>

          {/* Timeframe badges + action buttons */}
          <div className="flex items-center gap-2 ml-3" onClick={(e) => e.stopPropagation()}>
            {/* Timeframe badges (compact, max 3 shown) */}
            {pb.timeframes && pb.timeframes.length > 0 && (
              <div className="hidden sm:flex items-center gap-1">
                {pb.timeframes.slice(0, 3).map(tf => (
                  <span key={tf} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {tf}
                  </span>
                ))}
                {pb.timeframes.length > 3 && (
                  <span className="text-[10px] text-gray-400">+{pb.timeframes.length - 3}</span>
                )}
              </div>
            )}

            {/* R:R badge */}
            {pb.default_rr && (
              <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                {pb.default_rr}R
              </span>
            )}

            {/* Toggle active/inactive */}
            <button
              onClick={() => handleToggleActive(pb)}
              title={pb.is_active ? "Deactivate" : "Activate"}
              className={`w-3 h-3 rounded-full border transition
                ${pb.is_active
                  ? "bg-green-500 border-green-600 hover:bg-green-400"
                  : "bg-gray-300 border-gray-400 hover:bg-green-400"
                }`}
            />

            {/* Edit button */}
            <button
              onClick={() => startEdit(pb)}
              className="text-xs text-gray-400 hover:text-indigo-600 transition"
            >
              Edit
            </button>

            {/* Delete button */}
            <button
              onClick={() => handleDelete(pb.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition"
            >
              Delete
            </button>
          </div>
        </div>

        {/* ─── Expanded Details / Edit Form ────────────────────── */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            {isEditing ? (
              /* ─── Edit Form (full playbook fields) ─────────────── */
              <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Strategy name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                               focus:outline-none focus:border-indigo-400 transition"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                               focus:outline-none focus:border-indigo-400 transition resize-none"
                  />
                </div>

                {/* Entry / Exit rules side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Entry rules</label>
                    <textarea
                      value={editForm.entry_rules}
                      onChange={(e) => setEditForm({ ...editForm, entry_rules: e.target.value })}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                                 focus:outline-none focus:border-indigo-400 transition resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Exit rules</label>
                    <textarea
                      value={editForm.exit_rules}
                      onChange={(e) => setEditForm({ ...editForm, exit_rules: e.target.value })}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                                 focus:outline-none focus:border-indigo-400 transition resize-none"
                    />
                  </div>
                </div>

                {/* Ideal conditions */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ideal market conditions</label>
                  <textarea
                    value={editForm.ideal_conditions}
                    onChange={(e) => setEditForm({ ...editForm, ideal_conditions: e.target.value })}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                               focus:outline-none focus:border-indigo-400 transition resize-none"
                  />
                </div>

                {/* Timeframes + R:R */}
                <div className="flex items-start gap-6">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1.5">Timeframes</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TIMEFRAMES.map(tf => (
                        <button
                          key={tf.value}
                          onClick={() => toggleTimeframe(editForm.timeframes, tf.value,
                            (tfs) => setEditForm({ ...editForm, timeframes: tfs }))}
                          className={`px-2.5 py-1 text-xs rounded-lg border transition
                            ${editForm.timeframes.includes(tf.value)
                              ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
                              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                            }`}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-28">
                    <label className="block text-xs text-gray-500 mb-1">Target R:R</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={editForm.default_rr}
                      onChange={(e) => setEditForm({ ...editForm, default_rr: e.target.value })}
                      placeholder="e.g. 2.0"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                                 focus:outline-none focus:border-indigo-400 transition"
                    />
                  </div>
                </div>

                {/* Save / Cancel */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditId(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editForm.name.trim()}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition
                      ${editForm.name.trim() && !saving
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                  >
                    {saving ? "Saving\u2026" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              /* ─── Read-only Detail View ────────────────────────── */
              <div className="space-y-3 text-sm">
                {/* Description */}
                {pb.description && (
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Description</span>
                    <p className="text-gray-700 whitespace-pre-wrap">{pb.description}</p>
                  </div>
                )}

                {/* Entry / Exit rules side by side */}
                <div className="grid grid-cols-2 gap-4">
                  {pb.entry_rules && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-0.5">Entry rules</span>
                      <p className="text-gray-700 whitespace-pre-wrap">{pb.entry_rules}</p>
                    </div>
                  )}
                  {pb.exit_rules && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-0.5">Exit rules</span>
                      <p className="text-gray-700 whitespace-pre-wrap">{pb.exit_rules}</p>
                    </div>
                  )}
                </div>

                {/* Ideal conditions */}
                {pb.ideal_conditions && (
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Ideal conditions</span>
                    <p className="text-gray-700 whitespace-pre-wrap">{pb.ideal_conditions}</p>
                  </div>
                )}

                {/* Timeframes + R:R in a row */}
                <div className="flex items-center gap-4">
                  {pb.timeframes && pb.timeframes.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-1">Timeframes</span>
                      <div className="flex items-center gap-1">
                        {pb.timeframes.map(tf => (
                          <span key={tf} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {tf}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {pb.default_rr && (
                    <div>
                      <span className="text-xs text-gray-400 block mb-1">Target R:R</span>
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-medium">
                        {pb.default_rr}R
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
