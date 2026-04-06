/**
 * app/settings/tag-categories/TagCategoryManager.tsx
 *
 * The full management UI for the modular tag-category system.
 *
 * Layout:
 *   ┌─ Add category bar ──────────────────────────────────┐
 *   │  [ Name ____________ ] [ Type ▼ ] [ + Add ]         │
 *   └─────────────────────────────────────────────────────┘
 *   ┌─ Category row (draggable) ─────────────────────────┐
 *   │  ⋮⋮  Setups          Multi-select        ⋯          │
 *   │     ┌──────────────────────────────────────────┐    │
 *   │     │ breakout × │ trend × │ ... [+ option]    │    │
 *   │     └──────────────────────────────────────────┘    │
 *   └─────────────────────────────────────────────────────┘
 *
 * Drag-and-drop uses native HTML5 drag events (no external dep).
 * - Each row has draggable="true".
 * - On drop, we compute the new order and optimistically reindex via
 *   the useTagCategories.reorderCategories setter.
 */

"use client";

import { useMemo, useState } from "react";
import { useTagCategories } from "@/components/tagCategories/useTagCategories";
import FieldRenderer from "@/components/tagCategories/fields/FieldRenderer";
import {
  FIELD_TYPES, FIELD_TYPE_LABELS, FIELD_TYPE_DESCRIPTIONS,
  type FieldType, type TagCategory, type TagOption,
  type StarRatingConfig, type SliderConfig,
  type YesNoConfig, type ShortTextConfig,
  emptyValueFor,
} from "@/lib/tagCategories/types";

export default function TagCategoryManager() {
  const store = useTagCategories();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("multi_select");
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    await store.createCategory({ name, field_type: newType });
    setNewName("");
    setNewType("multi_select");
    setCreating(false);
  };

  // -------- Drag-and-drop handlers (category reorder) --------
  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };
  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      onDragEnd();
      return;
    }
    const ids = store.categories.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      onDragEnd();
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onDragEnd();
    await store.reorderCategories(next);
  };

  if (store.loading) {
    return <div className="text-xs text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Create bar */}
      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder="New category name, e.g. Setups"
          className="flex-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as FieldType)}
          className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!newName.trim() || creating}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Adding…" : "+ Add category"}
        </button>
      </div>

      <p className="text-[11px] text-gray-500">
        {FIELD_TYPE_DESCRIPTIONS[newType]}
      </p>

      {store.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {store.error}
        </div>
      )}

      {/* Category list */}
      {store.categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-500">
          No categories yet. Create one above to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {store.categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              options={store.optionsByCategory.get(cat.id) ?? []}
              isDragging={dragId === cat.id}
              isDragOver={dragOverId === cat.id && dragId !== cat.id}
              onDragStart={() => onDragStart(cat.id)}
              onDragOver={(e) => onDragOver(e, cat.id)}
              onDrop={() => void onDrop(cat.id)}
              onDragEnd={onDragEnd}
              onUpdate={(patch) => store.updateCategory(cat.id, patch)}
              onDelete={() => store.deleteCategory(cat.id)}
              onCreateOption={(label, color) => store.createOption(cat.id, label, color)}
              onUpdateOption={(patch) => store.updateOption(cat.id, patch)}
              onDeleteOption={(id) => store.deleteOption(cat.id, id)}
              onReorderOptions={(order) => store.reorderOptions(cat.id, order)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// CategoryCard — one draggable row
// ------------------------------------------------------------
interface CardProps {
  category: TagCategory;
  options: Awaited<ReturnType<typeof Promise.resolve<import("@/lib/tagCategories/types").TagOption[]>>>;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onUpdate: (patch: Partial<Pick<TagCategory, "name" | "color" | "icon" | "config" | "position">>) => void;
  onDelete: () => void;
  onCreateOption: (label: string, color?: string) => void;
  onUpdateOption: (patch: { id: string; label?: string; color?: string; position?: number }) => void;
  onDeleteOption: (id: string) => void;
  onReorderOptions: (order: string[]) => void;
}

function CategoryCard({
  category, options, isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onUpdate, onDelete,
  onCreateOption, onUpdateOption, onDeleteOption, onReorderOptions,
}: CardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(category.name);
  const [expanded, setExpanded] = useState(false);

  const saveName = () => {
    setEditingName(false);
    if (nameDraft.trim() && nameDraft !== category.name) {
      onUpdate({ name: nameDraft.trim() });
    } else {
      setNameDraft(category.name);
    }
  };

  const isOptionType =
    category.field_type === "multi_select" || category.field_type === "single_select";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={[
        "rounded-lg border bg-white transition",
        isDragging ? "opacity-40" : "opacity-100",
        isDragOver ? "border-indigo-400 ring-2 ring-indigo-100" : "border-gray-200",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="cursor-grab select-none text-gray-300 hover:text-gray-500"
          title="Drag to reorder"
        >
          ⋮⋮
        </span>

        <input
          type="color"
          value={category.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="h-5 w-5 cursor-pointer rounded border border-gray-200 bg-white p-0"
          title="Category color"
        />

        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setNameDraft(category.name);
                setEditingName(false);
              }
            }}
            className="flex-1 rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="flex-1 truncate text-left text-xs font-medium text-gray-800 hover:text-indigo-600"
            title="Click to rename"
          >
            {category.name}
          </button>
        )}

        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
          {FIELD_TYPE_LABELS[category.field_type]}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
        >
          {expanded ? "Close" : "Configure"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && !window.confirm(`Delete "${category.name}"? This also removes it from every trade.`)) return;
            onDelete();
          }}
          className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:border-red-300 hover:text-red-600"
        >
          Delete
        </button>
      </div>

      {/* Expanded configuration body */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
          {isOptionType ? (
            <OptionsEditor
              categoryId={category.id}
              options={options}
              onCreate={onCreateOption}
              onUpdate={onUpdateOption}
              onDelete={onDeleteOption}
              onReorder={onReorderOptions}
            />
          ) : (
            <ConfigEditor category={category} onUpdate={onUpdate} />
          )}
          <div className="mt-3 rounded border border-gray-200 bg-white p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">Preview</div>
            <FieldRenderer
              category={category}
              options={options}
              value={emptyValueFor(category.field_type, category.config)}
              onChange={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Config editor — renders per-field-type knobs (max stars, slider range, etc.)
// ------------------------------------------------------------
function ConfigEditor({
  category, onUpdate,
}: {
  category: TagCategory;
  onUpdate: CardProps["onUpdate"];
}) {
  switch (category.field_type) {
    case "star_rating": {
      const cfg = category.config as StarRatingConfig;
      return (
        <label className="flex items-center gap-2 text-xs text-gray-700">
          Max stars
          <input
            type="number"
            min={1}
            max={10}
            value={cfg.max ?? 5}
            onChange={(e) =>
              onUpdate({ config: { ...cfg, max: Math.max(1, Math.min(10, Number(e.target.value))) } })
            }
            className="w-16 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      );
    }
    case "slider": {
      const cfg = category.config as SliderConfig;
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
          <label className="flex items-center gap-1">
            Min
            <input
              type="number"
              value={cfg.min ?? 0}
              onChange={(e) => onUpdate({ config: { ...cfg, min: Number(e.target.value) } })}
              className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            Max
            <input
              type="number"
              value={cfg.max ?? 100}
              onChange={(e) => onUpdate({ config: { ...cfg, max: Number(e.target.value) } })}
              className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            Step
            <input
              type="number"
              value={cfg.step ?? 1}
              onChange={(e) => onUpdate({ config: { ...cfg, step: Number(e.target.value) } })}
              className="w-16 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            Unit
            <input
              type="text"
              value={cfg.unit ?? ""}
              onChange={(e) => onUpdate({ config: { ...cfg, unit: e.target.value } })}
              placeholder="R, %, pips…"
              className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            />
          </label>
        </div>
      );
    }
    case "yes_no": {
      const cfg = category.config as YesNoConfig;
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
          <label className="flex items-center gap-1">
            True label
            <input
              type="text"
              value={cfg.true_label ?? "Yes"}
              onChange={(e) => onUpdate({ config: { ...cfg, true_label: e.target.value } })}
              className="w-24 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            False label
            <input
              type="text"
              value={cfg.false_label ?? "No"}
              onChange={(e) => onUpdate({ config: { ...cfg, false_label: e.target.value } })}
              className="w-24 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
            />
          </label>
        </div>
      );
    }
    case "short_text": {
      const cfg = category.config as ShortTextConfig;
      return (
        <label className="flex items-center gap-2 text-xs text-gray-700">
          Placeholder
          <input
            type="text"
            value={cfg.placeholder ?? ""}
            onChange={(e) => onUpdate({ config: { ...cfg, placeholder: e.target.value } })}
            className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      );
    }
    default:
      return (
        <div className="text-xs text-gray-500">No extra configuration for this field type.</div>
      );
  }
}

// ------------------------------------------------------------
// OptionsEditor — add/rename/recolor/delete/reorder options for a select category
// ------------------------------------------------------------
interface OptionsEditorProps {
  categoryId: string;
  options: import("@/lib/tagCategories/types").TagOption[];
  onCreate: (label: string, color?: string) => void;
  onUpdate: (patch: { id: string; label?: string; color?: string; position?: number }) => void;
  onDelete: (id: string) => void;
  onReorder: (order: string[]) => void;
}

function OptionsEditor({
  options, onCreate, onUpdate, onDelete, onReorder,
}: OptionsEditorProps) {
  const [newLabel, setNewLabel] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const sorted = useMemo(() => [...options].sort((a, b) => a.position - b.position), [options]);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    onCreate(label);
    setNewLabel("");
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = sorted.map((o) => o.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setDragId(null);
    onReorder(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {sorted.length === 0 && (
        <div className="text-[11px] text-gray-400">No options yet — add your first one below.</div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((o) => (
          <div
            key={o.id}
            draggable
            onDragStart={() => setDragId(o.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(o.id);
            }}
            onDragEnd={() => setDragId(null)}
            className={[
              "group flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
              dragId === o.id ? "opacity-40" : "",
            ].join(" ")}
            style={{ borderColor: o.color, color: o.color, backgroundColor: `${o.color}10` }}
          >
            <input
              type="color"
              value={o.color}
              onChange={(e) => onUpdate({ id: o.id, color: e.target.value })}
              className="h-3 w-3 cursor-pointer rounded-full border-0 bg-transparent p-0"
              title="Option color"
            />
            <input
              type="text"
              value={o.label}
              onChange={(e) => onUpdate({ id: o.id, label: e.target.value })}
              className="bg-transparent text-xs focus:outline-none"
              style={{ width: `${Math.max(o.label.length, 4)}ch`, color: "#374151" }}
            />
            <button
              type="button"
              onClick={() => onDelete(o.id)}
              className="text-gray-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
              title="Delete option"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="New option"
          className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newLabel.trim()}
          className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
