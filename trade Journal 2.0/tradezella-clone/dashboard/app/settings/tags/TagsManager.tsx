/**
 * app/settings/tags/TagsManager.tsx — Tags CRUD manager (Client Component).
 *
 * Full tag management UI with:
 *   - Create new tags with name, color picker, and category selector
 *   - Edit existing tags inline (name, color, category)
 *   - Delete tags with confirmation
 *   - Tags grouped by category (Strategy, Emotion, Market Condition, Mistake, Custom)
 *   - Color-coded tag pills showing the tag visually
 *
 * Uses /api/tags for all CRUD operations and router.refresh() to sync
 * with the Server Component after changes.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TagData } from "@/lib/types";

/** Category display names and their order. */
const CATEGORIES = [
  { value: "strategy",         label: "Strategy" },
  { value: "emotion",          label: "Emotion" },
  { value: "market_condition", label: "Market Condition" },
  { value: "mistake",          label: "Mistake" },
  { value: "custom",           label: "Custom" },
] as const;

/** Preset colors for the color picker. */
const COLOR_PRESETS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6b7280", // gray
];

export default function TagsManager({ initialTags }: { initialTags: TagData[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<TagData[]>(initialTags);

  // New tag form state
  const [showForm, setShowForm]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [newColor, setNewColor]       = useState(COLOR_PRESETS[0]);
  const [newCategory, setNewCategory] = useState("custom");
  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState("");

  // Edit mode state — which tag ID is being edited (null = none)
  const [editId, setEditId]           = useState<string | null>(null);
  const [editName, setEditName]       = useState("");
  const [editColor, setEditColor]     = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [saving, setSaving]           = useState(false);

  /**
   * Creates a new tag via POST /api/tags.
   * On success, adds it to local state and resets the form.
   */
  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor, category: newCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tag");

      // Add new tag to local state and reset form
      setTags(prev => [...prev, data.tag]);
      setNewName("");
      setNewColor(COLOR_PRESETS[0]);
      setNewCategory("custom");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Saves edits to an existing tag via PUT /api/tags.
   */
  async function handleSaveEdit() {
    if (!editId || saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          name: editName.trim(),
          color: editColor,
          category: editCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update tag");

      // Update local state with the returned tag
      setTags(prev => prev.map(t => t.id === editId ? data.tag : t));
      setEditId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Deletes a tag via DELETE /api/tags.
   * Removes it from local state immediately.
   */
  async function handleDelete(id: string) {
    setError("");

    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete tag");

      setTags(prev => prev.filter(t => t.id !== id));
      if (editId === id) setEditId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /** Start editing a tag — populate edit fields. */
  function startEdit(tag: TagData) {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
    setEditCategory(tag.category);
    setError("");
  }

  /** Group tags by category for display. */
  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    tags: tags.filter(t => t.category === cat.value),
  })).filter(g => g.tags.length > 0); // only show categories that have tags

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Create tag button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500
                     text-white text-xs font-medium px-3 py-1.5 rounded-lg transition mb-6"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New tag
        </button>
      ) : (
        /* New tag creation form */
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            {/* Name input */}
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Breakout, FOMO, Trending"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                           focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>

            {/* Category selector */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                           focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Color picker */}
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1.5">Color</label>
            <div className="flex items-center gap-1.5">
              {COLOR_PRESETS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  className={`w-6 h-6 rounded-full border-2 transition
                    ${newColor === color ? "border-gray-900 scale-110" : "border-transparent hover:border-gray-300"}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Preview + action buttons */}
          <div className="mt-4 flex items-center justify-between">
            {/* Tag preview */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Preview:</span>
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-white"
                style={{ backgroundColor: newColor }}
              >
                {newName || "Tag name"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowForm(false); setNewName(""); setError(""); }}
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
                {creating ? "Creating…" : "Create tag"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tags list grouped by category */}
      {grouped.length === 0 && !showForm ? (
        /* Empty state */
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm mb-1">No tags yet</p>
          <p className="text-gray-500 text-xs">Create tags to categorize and filter your trades</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(group => (
            <div key={group.value}>
              {/* Category heading */}
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </h3>

              <div className="space-y-1">
                {group.tags.map(tag => (
                  <div key={tag.id}>
                    {editId === tag.id ? (
                      /* Inline edit form */
                      <div className="bg-white border border-indigo-200 rounded-lg p-3 flex items-center gap-3">
                        {/* Color picker (compact) */}
                        <div className="flex items-center gap-1">
                          {COLOR_PRESETS.map(color => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              className={`w-4 h-4 rounded-full border transition
                                ${editColor === color ? "border-gray-900 scale-125" : "border-transparent"}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>

                        {/* Name input */}
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900
                                     focus:outline-none focus:border-indigo-400 transition"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); }}
                        />

                        {/* Category */}
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700
                                     focus:outline-none focus:border-indigo-400 transition"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>

                        {/* Save / Cancel */}
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving || !editName.trim()}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      /* Tag display row */
                      <div className="bg-white border border-gray-100 rounded-lg px-3 py-2.5
                                      flex items-center justify-between hover:border-gray-200 transition group">
                        <div className="flex items-center gap-2.5">
                          {/* Color dot */}
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          {/* Tag name */}
                          <span className="text-sm text-gray-900">{tag.name}</span>
                        </div>

                        {/* Actions — visible on hover */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => startEdit(tag)}
                            className="text-xs text-gray-400 hover:text-indigo-600 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tag.id)}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
