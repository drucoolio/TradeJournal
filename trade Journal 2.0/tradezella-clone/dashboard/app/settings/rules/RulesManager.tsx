/**
 * app/settings/rules/RulesManager.tsx — Rules Engine CRUD manager (Client Component).
 *
 * Provides the full interactive UI for managing personal trading rules:
 *   - Create new rules with name and optional description
 *   - Edit existing rules inline (name, description)
 *   - Toggle rules active/inactive (inactive rules stop appearing in the
 *     daily session checklist but are preserved for historical analytics)
 *   - Delete rules permanently
 *   - Visual distinction between active (green dot) and inactive (gray dot) rules
 *
 * DESIGN NOTES:
 *   - Follows the same UX pattern as TagsManager and MistakesManager
 *   - Active/inactive toggle is a key feature — deactivating a rule is
 *     preferable to deleting it, as it preserves historical session data
 *     (sessions.rules_followed[] and sessions.rules_broken[] arrays)
 *   - Rules are displayed with active rules first, then inactive, both
 *     sorted alphabetically within their groups
 *
 * ARCHITECTURE:
 *   - Receives initial data from the Server Component (page.tsx)
 *   - All mutations go through /api/rules (POST, PUT, DELETE)
 *   - Local state updated immediately, router.refresh() for cache sync
 *
 * RELATED FILES:
 *   - page.tsx — Server Component providing initialRules
 *   - /api/rules/route.ts — backend CRUD endpoints
 *   - TagsManager.tsx, MistakesManager.tsx — sister components
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RuleData } from "@/lib/types";

export default function RulesManager({ initialRules }: { initialRules: RuleData[] }) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleData[]>(initialRules);

  // ─── New Rule Form State ──────────────────────────────────────────
  const [showForm, setShowForm]               = useState(false);
  const [newName, setNewName]                 = useState("");
  const [newDescription, setNewDescription]   = useState("");
  const [creating, setCreating]               = useState(false);
  const [error, setError]                     = useState("");

  // ─── Inline Edit State ────────────────────────────────────────────
  const [editId, setEditId]                   = useState<string | null>(null);
  const [editName, setEditName]               = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving]                   = useState(false);

  /**
   * Creates a new trading rule via POST /api/rules.
   *
   * New rules default to is_active = true. On success, adds to local state,
   * resets form, and triggers server revalidation.
   */
  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create rule");

      // Add the server-returned rule to local state
      setRules(prev => [...prev, data.rule]);
      // Reset form
      setNewName("");
      setNewDescription("");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Saves edits to an existing rule via PUT /api/rules.
   * Sends name and description — the API handles partial updates.
   */
  async function handleSaveEdit() {
    if (!editId || saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:          editId,
          name:        editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update rule");

      // Replace the edited rule in local state
      setRules(prev => prev.map(r => r.id === editId ? data.rule : r));
      setEditId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Toggles a rule's active/inactive status via PUT /api/rules.
   *
   * This is a quick toggle — no need to enter full edit mode.
   * Inactive rules stop appearing in the daily session checklist but
   * remain in the rules library and in historical session data.
   */
  async function handleToggleActive(rule: RuleData) {
    setError("");

    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:        rule.id,
          is_active: !rule.is_active, // flip the current state
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to toggle rule");

      // Update local state with the server response
      setRules(prev => prev.map(r => r.id === rule.id ? data.rule : r));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /**
   * Deletes a rule via DELETE /api/rules.
   * Removes from local state immediately. Exits edit mode if needed.
   */
  async function handleDelete(id: string) {
    setError("");

    try {
      const res = await fetch("/api/rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete rule");

      setRules(prev => prev.filter(r => r.id !== id));
      if (editId === id) setEditId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /**
   * Enters inline edit mode for a specific rule.
   * Populates edit fields with the current values.
   */
  function startEdit(rule: RuleData) {
    setEditId(rule.id);
    setEditName(rule.name);
    setEditDescription(rule.description ?? "");
    setError("");
  }

  // ─── Separate rules into active and inactive groups ───────────────
  const activeRules   = rules.filter(r => r.is_active);
  const inactiveRules = rules.filter(r => !r.is_active);

  return (
    <div>
      {/* ─── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* ─── Create Rule Button / Form ─────────────────────────────── */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500
                     text-white text-xs font-medium px-3 py-1.5 rounded-lg transition mb-6"
        >
          {/* Plus icon */}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New rule
        </button>
      ) : (
        /* ─── New Rule Creation Form ─────────────────────────────── */
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          {/* Name field — required */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Rule</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Never risk more than 2% per trade"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleCreate(); }}
            />
          </div>

          {/* Description field — optional context for the rule */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Description <span className="text-gray-300">(optional)</span>
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Why this rule matters and when it applies..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setNewName(""); setNewDescription(""); setError(""); }}
              className="text-xs text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition
                ${newName.trim() && !creating
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
            >
              {creating ? "Creating\u2026" : "Create rule"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Rules List ────────────────────────────────────────────── */}
      {rules.length === 0 && !showForm ? (
        /* Empty state — no rules defined yet */
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            {/* Clipboard/checklist icon */}
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm mb-1">No trading rules yet</p>
          <p className="text-gray-500 text-xs">Create rules to track your trading discipline in the daily journal</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ─── Active Rules Section ────────────────────────────── */}
          {activeRules.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {/* Green dot indicating active status */}
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active rules ({activeRules.length})
              </h3>
              <div className="space-y-1">
                {activeRules.map(rule => renderRuleRow(rule))}
              </div>
            </div>
          )}

          {/* ─── Inactive Rules Section ──────────────────────────── */}
          {inactiveRules.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {/* Gray dot indicating inactive status */}
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                Inactive ({inactiveRules.length})
              </h3>
              <div className="space-y-1">
                {inactiveRules.map(rule => renderRuleRow(rule))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  /**
   * Renders a single rule row — either in display mode or inline edit mode.
   *
   * Extracted as a helper function to avoid duplicating the JSX between
   * the active and inactive rule sections.
   */
  function renderRuleRow(rule: RuleData) {
    return (
      <div key={rule.id}>
        {editId === rule.id ? (
          /* ─── Inline Edit Form ───────────────────────────────── */
          <div className="bg-white border border-indigo-200 rounded-lg p-3 space-y-2">
            {/* Name input */}
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSaveEdit(); }}
            />

            {/* Description textarea */}
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 transition resize-none"
            />

            {/* Save / Cancel buttons */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setEditId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition"
              >
                {saving ? "Saving\u2026" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          /* ─── Rule Display Row ───────────────────────────────── */
          <div className={`bg-white border rounded-lg px-3 py-2.5
                          flex items-start justify-between hover:border-gray-200 transition group
                          ${rule.is_active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              {/* Active/inactive toggle button — clickable dot */}
              <button
                onClick={() => handleToggleActive(rule)}
                title={rule.is_active ? "Deactivate rule" : "Activate rule"}
                className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 transition border
                  ${rule.is_active
                    ? "bg-green-500 border-green-600 hover:bg-green-400"
                    : "bg-gray-300 border-gray-400 hover:bg-green-400"
                  }`}
              />

              <div className="flex-1 min-w-0">
                {/* Rule name */}
                <span className="text-sm text-gray-900">{rule.name}</span>

                {/* Description — muted text below the name */}
                {rule.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {rule.description}
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons — visible on hover */}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition ml-3 flex-shrink-0">
              <button
                onClick={() => startEdit(rule)}
                className="text-xs text-gray-400 hover:text-indigo-600 transition"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(rule.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
}
