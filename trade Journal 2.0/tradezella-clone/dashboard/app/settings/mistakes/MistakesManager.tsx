/**
 * app/settings/mistakes/MistakesManager.tsx — Mistake Library CRUD manager (Client Component).
 *
 * Provides the full interactive UI for managing the user's mistake library:
 *   - View all mistakes in an alphabetically sorted list
 *   - Create new custom mistakes with name and optional description
 *   - Edit existing mistakes inline (both defaults and custom)
 *   - Delete mistakes with immediate UI feedback
 *   - Visual distinction between default (seeded) and custom mistakes
 *
 * DESIGN NOTES:
 *   - Follows the same UX pattern as TagsManager for consistency
 *   - Default mistakes show a small "Default" badge so users know
 *     they came pre-loaded (they can still edit/delete them)
 *   - Description field is optional but encouraged — it appears as
 *     muted text below the mistake name in the list view
 *
 * ARCHITECTURE:
 *   - Receives initial data from the Server Component (page.tsx)
 *   - All mutations go through /api/mistakes (POST, PUT, DELETE)
 *   - Local state is updated optimistically, then router.refresh()
 *     re-validates the Server Component cache for consistency
 *
 * RELATED FILES:
 *   - page.tsx — Server Component that provides initialMistakes
 *   - /api/mistakes/route.ts — backend CRUD endpoints
 *   - TagsManager.tsx — sister component with similar patterns
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MistakeData } from "@/lib/types";

export default function MistakesManager({ initialMistakes }: { initialMistakes: MistakeData[] }) {
  const router = useRouter();
  const [mistakes, setMistakes] = useState<MistakeData[]>(initialMistakes);

  // ─── New Mistake Form State ───────────────────────────────────────
  const [showForm, setShowForm]               = useState(false);
  const [newName, setNewName]                 = useState("");
  const [newDescription, setNewDescription]   = useState("");
  const [creating, setCreating]               = useState(false);
  const [error, setError]                     = useState("");

  // ─── Inline Edit State ────────────────────────────────────────────
  // Tracks which mistake (by ID) is currently in edit mode.
  // Only one mistake can be edited at a time.
  const [editId, setEditId]                   = useState<string | null>(null);
  const [editName, setEditName]               = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving]                   = useState(false);

  /**
   * Creates a new custom mistake via POST /api/mistakes.
   *
   * On success: adds to local state, resets form, triggers server revalidation.
   * On failure: shows error message in the error banner.
   */
  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create mistake");

      // Update local state with the server-returned mistake object
      setMistakes(prev => [...prev, data.mistake]);
      // Reset form fields
      setNewName("");
      setNewDescription("");
      setShowForm(false);
      // Revalidate the Server Component so the page stays in sync
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Saves edits to an existing mistake via PUT /api/mistakes.
   *
   * Only sends fields that the user may have changed (name, description).
   * The API handles partial updates — only provided fields are written.
   */
  async function handleSaveEdit() {
    if (!editId || saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/mistakes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:          editId,
          name:        editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update mistake");

      // Replace the edited mistake in local state with server response
      setMistakes(prev => prev.map(m => m.id === editId ? data.mistake : m));
      setEditId(null); // exit edit mode
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Deletes a mistake via DELETE /api/mistakes.
   *
   * Removes from local state immediately for responsive UI.
   * If the deleted mistake was being edited, exits edit mode.
   *
   * NOTE: Trades referencing this mistake's ID in their mistake_ids[]
   * will retain the stale UUID. The trade journal UI filters these out.
   */
  async function handleDelete(id: string) {
    setError("");

    try {
      const res = await fetch("/api/mistakes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete mistake");

      // Remove from local state
      setMistakes(prev => prev.filter(m => m.id !== id));
      // Exit edit mode if the deleted mistake was being edited
      if (editId === id) setEditId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /**
   * Enters inline edit mode for a specific mistake.
   * Populates the edit fields with the current values.
   */
  function startEdit(mistake: MistakeData) {
    setEditId(mistake.id);
    setEditName(mistake.name);
    setEditDescription(mistake.description ?? "");
    setError("");
  }

  return (
    <div>
      {/* ─── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* ─── Create Mistake Button / Form ──────────────────────────── */}
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
          New mistake
        </button>
      ) : (
        /* ─── New Mistake Creation Form ──────────────────────────── */
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          {/* Name field — required */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Moved stop loss, FOMO entry"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleCreate(); }}
            />
          </div>

          {/* Description field — optional */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Description <span className="text-gray-300">(optional)</span>
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Briefly describe this mistake and why it's harmful..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                         focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none"
            />
          </div>

          {/* Action buttons — Cancel and Create */}
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
              {creating ? "Creating\u2026" : "Create mistake"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Mistakes List ─────────────────────────────────────────── */}
      {mistakes.length === 0 && !showForm ? (
        /* Empty state — should rarely show since defaults are seeded */
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-3">
            {/* Warning/alert icon */}
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm mb-1">No mistakes defined</p>
          <p className="text-gray-500 text-xs">Create mistakes to track common trading errors on your trades</p>
        </div>
      ) : (
        /* Mistake list — alphabetically sorted */
        <div className="space-y-1">
          {mistakes.map(mistake => (
            <div key={mistake.id}>
              {editId === mistake.id ? (
                /* ─── Inline Edit Form ─────────────────────────────── */
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
                /* ─── Mistake Display Row ──────────────────────────── */
                <div className="bg-white border border-gray-100 rounded-lg px-3 py-2.5
                                flex items-start justify-between hover:border-gray-200 transition group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {/* Mistake name */}
                      <span className="text-sm text-gray-900">{mistake.name}</span>

                      {/* "Default" badge — indicates this was a seeded mistake */}
                      {mistake.is_default && (
                        <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>

                    {/* Description — shown as muted text below the name */}
                    {mistake.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {mistake.description}
                      </p>
                    )}
                  </div>

                  {/* Action buttons — visible on hover */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition ml-3 flex-shrink-0">
                    <button
                      onClick={() => startEdit(mistake)}
                      className="text-xs text-gray-400 hover:text-indigo-600 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(mistake.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
