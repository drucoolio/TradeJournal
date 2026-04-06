/**
 * components/editor/TemplatePickerMenu.tsx
 *
 * A "Templates ▾" dropdown meant to live in the top-right of any editor
 * surface. Lists the user's templates + globals, lets them apply one to the
 * current editor, or opens the TemplateEditorModal for full management.
 *
 * Applying a template REPLACES the current content — we prompt first if the
 * editor is non-empty. The caller decides what "apply" does (pass onApply).
 *
 * This component is intentionally lightweight and stateless about the editor
 * itself; it just surfaces templates and fires callbacks.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useTemplates } from "@/components/templates/useTemplates";
import type { DbNoteTemplate, TipTapDoc } from "@/lib/editor/types";

interface Props {
  onApply: (template: { json: TipTapDoc; html: string; name: string }) => void;
  onManage: () => void;
}

export default function TemplatePickerMenu({ onApply, onManage }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const store = useTemplates();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const apply = (t: DbNoteTemplate) => {
    onApply({
      json: (t.content_json ?? { type: "doc", content: [{ type: "paragraph" }] }) as TipTapDoc,
      html: t.content_html ?? "<p></p>",
      name: t.name,
    });
    setOpen(false);
  };

  const favs = store.templates.filter((t) => store.favouriteIds.has(t.id));
  const others = store.templates.filter((t) => !store.favouriteIds.has(t.id));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
      >
        Templates <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {store.loading && (
              <div className="px-3 py-2 text-[11px] text-gray-400">Loading…</div>
            )}
            {!store.loading && !store.templates.length && (
              <div className="px-3 py-2 text-[11px] text-gray-400">No templates yet.</div>
            )}
            {favs.length > 0 && (
              <>
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                  Favourites
                </div>
                {favs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(t)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                  >
                    {t.name}
                  </button>
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                  All templates
                </div>
                {others.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(t)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                  >
                    {t.name}
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="mt-1 border-t border-gray-200 pt-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-[11px] text-indigo-600 hover:bg-gray-100"
            >
              Manage templates…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
