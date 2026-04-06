/**
 * components/templates/TemplateEditorModal.tsx
 *
 * Full-screen modal that replicates Tradezella's "Create template" UX:
 *   ┌────────────┬──────────────────────────────────────────┐
 *   │  Sidebar   │  Title                                   │
 *   │  (search)  │  ─────────────────────────────────────── │
 *   │  Fav       │  [ RichNoteEditor with toolbar ]         │
 *   │  Rec'd     │                                          │
 *   │  Mine      │                                          │
 *   │            │                        [Cancel] [Save]   │
 *   └────────────┴──────────────────────────────────────────┘
 *
 * State strategy:
 *   - `draft` holds the in-memory edits for the currently selected template.
 *     Changes are NOT persisted to the DB until the user clicks Save.
 *   - Switching templates while the draft is dirty prompts before discarding.
 *   - Recommended (global) rows are read-only — editing them auto-duplicates
 *     into the user's library on first keystroke. For v1 we keep it simpler:
 *     we show Recommended rows read-only and offer a "Duplicate" button.
 *
 * This component intentionally delegates EVERY side effect to the useTemplates
 * hook — it has zero fetch() calls of its own.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTemplates } from "./useTemplates";
import TemplateSidebar from "./TemplateSidebar";
import RichNoteEditor from "@/components/editor/RichNoteEditor";
import { emptyDoc } from "@/lib/editor/defaults";
import type { DbNoteTemplate, NoteKind, TipTapDoc } from "@/lib/editor/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-select a template when the modal opens. */
  initialSelectedId?: string | null;
  /** Which kind of note is currently being edited — affects "Pin as default" wording. */
  kindContext?: NoteKind;
}

interface DraftState {
  id: string | null;   // null = unsaved new template
  name: string;
  json: TipTapDoc;
  html: string;
  dirty: boolean;
  ownedByUser: boolean;
}

const freshDraft = (): DraftState => ({
  id: null,
  name: "Untitled template",
  json: emptyDoc(),
  html: "<p></p>",
  dirty: false,
  ownedByUser: true,
});

export default function TemplateEditorModal({
  open,
  onClose,
  initialSelectedId = null,
  kindContext = "trade",
}: Props) {
  const store = useTemplates();
  const [draft, setDraft] = useState<DraftState>(freshDraft);
  const [saving, setSaving] = useState(false);

  // Load initial selection when modal opens (or switch templates in the list).
  const loadTemplate = (t: DbNoteTemplate) => {
    setDraft({
      id: t.id,
      name: t.name,
      json: (t.content_json ?? emptyDoc()) as TipTapDoc,
      html: t.content_html ?? "<p></p>",
      dirty: false,
      ownedByUser: t.user_id !== null,
    });
  };

  useEffect(() => {
    if (!open) return;
    if (initialSelectedId) {
      const t = store.templates.find((x) => x.id === initialSelectedId);
      if (t) loadTemplate(t);
    } else if (!store.loading && store.templates.length && draft.id === null && !draft.dirty) {
      loadTemplate(store.templates[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store.loading, store.templates.length, initialSelectedId]);

  const discardPrompt = () => {
    if (!draft.dirty) return true;
    return typeof window !== "undefined"
      ? window.confirm("You have unsaved changes. Discard them?")
      : true;
  };

  const selectTemplate = (id: string) => {
    const t = store.templates.find((x) => x.id === id);
    if (!t) return;
    if (!discardPrompt()) return;
    loadTemplate(t);
  };

  const newTemplate = async () => {
    if (!discardPrompt()) return;
    // Create the row in the DB immediately so it shows up in the sidebar
    // list — otherwise users click the button, see nothing new in the list,
    // and assume it didn't work. The row starts empty and the user edits in
    // place; Save just updates it from there.
    setSaving(true);
    try {
      const created = await store.create({
        name: "Untitled template",
        content_json: emptyDoc(),
        content_html: "<p></p>",
      });
      if (created) {
        setDraft({
          id: created.id,
          name: created.name,
          json: (created.content_json ?? emptyDoc()) as TipTapDoc,
          html: created.content_html ?? "<p></p>",
          dirty: false,
          ownedByUser: true,
        });
      } else {
        // Fallback: at least show a fresh in-memory draft so the editor isn't
        // stuck on the previous template.
        setDraft(freshDraft());
      }
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (!draft.ownedByUser && draft.id !== null) {
        // Editing a Recommended template — duplicate first, then patch.
        const copy = await store.duplicate(draft.id);
        if (!copy) return;
        const ok = await store.update(copy.id, {
          name: draft.name,
          content_json: draft.json,
          content_html: draft.html,
        });
        if (ok) setDraft((d) => ({ ...d, id: copy.id, ownedByUser: true, dirty: false }));
      } else if (draft.id === null) {
        const created = await store.create({
          name: draft.name.trim() || "Untitled template",
          content_json: draft.json,
          content_html: draft.html,
        });
        if (created) setDraft((d) => ({ ...d, id: created.id, dirty: false, ownedByUser: true }));
      } else {
        const ok = await store.update(draft.id, {
          name: draft.name,
          content_json: draft.json,
          content_html: draft.html,
        });
        if (ok) setDraft((d) => ({ ...d, dirty: false }));
      }
    } finally {
      setSaving(false);
    }
  };

  const pinAsDefault = async () => {
    if (draft.id === null) return;
    const currentDefault = store.templates.find(
      (t) => (kindContext === "trade" ? t.is_default_trade : t.is_default_journal),
    );
    const unsetFirst = currentDefault && currentDefault.id !== draft.id;
    if (unsetFirst) {
      await store.setDefault(currentDefault!.id, kindContext, false);
    }
    const newId = await store.setDefault(draft.id, kindContext, true);
    if (newId && newId !== draft.id) {
      // Recommended → duplicated path — switch draft to the new row.
      const next = store.templates.find((t) => t.id === newId);
      if (next) loadTemplate(next);
    }
  };

  const deleteTemplate = async () => {
    if (!draft.ownedByUser || draft.id === null) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this template?")) return;
    const ok = await store.remove(draft.id);
    if (ok) setDraft(freshDraft());
  };

  const isDefault = useMemo(() => {
    if (!draft.id) return false;
    const row = store.templates.find((t) => t.id === draft.id);
    if (!row) return false;
    return kindContext === "trade" ? row.is_default_trade : row.is_default_journal;
  }, [draft.id, store.templates, kindContext]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
      <div className="flex h-[85vh] w-[min(1100px,95vw)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <TemplateSidebar
          templates={store.templates}
          favouriteIds={store.favouriteIds}
          selectedId={draft.id}
          onSelect={selectTemplate}
          onNew={newTemplate}
          onToggleFavourite={store.toggleFavourite}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, dirty: true }))}
              placeholder="Template title"
              className="flex-1 bg-transparent text-base font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none"
              disabled={!draft.ownedByUser && draft.id !== null}
            />
            {draft.id !== null && draft.ownedByUser && (
              <>
                <button
                  type="button"
                  onClick={pinAsDefault}
                  className={[
                    "rounded-md border px-2.5 py-1 text-[11px] transition",
                    isDefault
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-100",
                  ].join(" ")}
                  title={`Pin as default ${kindContext} template`}
                >
                  {isDefault ? `Default ${kindContext}` : `Pin as default ${kindContext}`}
                </button>
                <button
                  type="button"
                  onClick={deleteTemplate}
                  className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] text-gray-700 hover:border-red-300 hover:text-red-600"
                >
                  Delete
                </button>
              </>
            )}
            {!draft.ownedByUser && draft.id !== null && (
              <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                Recommended — edits will duplicate
              </span>
            )}
          </div>

          {/* Editor */}
          <div className="min-h-0 flex-1 p-4">
            <RichNoteEditor
              value={draft.json}
              onChange={({ json, html }) =>
                setDraft((d) => ({ ...d, json, html, dirty: true }))
              }
              placeholder="Start writing your template…"
              fill
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
            {store.error && <span className="mr-auto text-xs text-red-600">{store.error}</span>}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || (!draft.dirty && draft.id !== null)}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
