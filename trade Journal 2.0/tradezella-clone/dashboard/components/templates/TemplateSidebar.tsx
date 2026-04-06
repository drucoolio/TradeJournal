/**
 * components/templates/TemplateSidebar.tsx
 *
 * Left pane of the Template Editor modal. Shows three sections with a search
 * input at the top:
 *   - Favourites (user's starred templates, can include Recommended rows)
 *   - Recommended (global user_id = null rows)
 *   - My templates (rows owned by the user)
 *
 * All data comes from the useTemplates hook via props — the sidebar itself is
 * pure UI. Parent decides what happens on select/new/delete.
 */

"use client";

import { useMemo, useState } from "react";
import type { DbNoteTemplate } from "@/lib/editor/types";
import TemplateSidebarItem from "./TemplateSidebarItem";

interface Props {
  templates: DbNoteTemplate[];
  favouriteIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onToggleFavourite: (id: string) => void;
}

export default function TemplateSidebar({
  templates,
  favouriteIds,
  selectedId,
  onSelect,
  onNew,
  onToggleFavourite,
}: Props) {
  const [query, setQuery] = useState("");

  const { favs, recommended, mine } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: DbNoteTemplate) =>
      !q || t.name.toLowerCase().includes(q);
    const fav: DbNoteTemplate[] = [];
    const rec: DbNoteTemplate[] = [];
    const own: DbNoteTemplate[] = [];
    for (const t of templates) {
      if (!match(t)) continue;
      if (favouriteIds.has(t.id)) fav.push(t);
      if (t.user_id === null) rec.push(t);
      else own.push(t);
    }
    const sortByName = (a: DbNoteTemplate, b: DbNoteTemplate) =>
      a.name.localeCompare(b.name);
    return {
      favs: fav.sort(sortByName),
      recommended: rec.sort(sortByName),
      mine: own.sort(sortByName),
    };
  }, [templates, favouriteIds, query]);

  const section = (title: string, rows: DbNoteTemplate[]) => {
    if (!rows.length) return null;
    return (
      <div className="mb-3">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </div>
        <div className="space-y-0.5">
          {rows.map((t) => (
            <TemplateSidebarItem
              key={t.id}
              template={t}
              active={t.id === selectedId}
              isFavourite={favouriteIds.has(t.id)}
              onSelect={() => onSelect(t.id)}
              onToggleFavourite={() => onToggleFavourite(t.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 p-3">
        <button
          type="button"
          onClick={onNew}
          className="mb-2 flex w-full items-center justify-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          <span>＋</span> New template
        </button>
        <input
          type="text"
          placeholder="Search templates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {section("Favourites", favs)}
        {section("Recommended", recommended)}
        {section("My templates", mine)}
        {!favs.length && !recommended.length && !mine.length && (
          <div className="mt-6 px-2 text-center text-[11px] text-gray-400">
            No templates match your search.
          </div>
        )}
      </div>
    </div>
  );
}
