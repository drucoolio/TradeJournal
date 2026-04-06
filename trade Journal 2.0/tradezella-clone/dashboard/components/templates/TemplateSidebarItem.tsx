/**
 * components/templates/TemplateSidebarItem.tsx
 *
 * Single row in the left sidebar of the Template Editor modal. Shows the
 * template name, a star button to toggle favourite, and a thin "Default"
 * indicator badge if pinned.
 *
 * Kept as its own component so the sidebar list stays a trivial .map().
 */

"use client";

import type { DbNoteTemplate } from "@/lib/editor/types";

interface Props {
  template: DbNoteTemplate;
  active: boolean;
  isFavourite: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}

export default function TemplateSidebarItem({
  template,
  active,
  isFavourite,
  onSelect,
  onToggleFavourite,
}: Props) {
  return (
    <div
      className={[
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer transition",
        active ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
      onClick={onSelect}
    >
      <button
        type="button"
        className={[
          "text-[13px] leading-none",
          isFavourite ? "text-amber-500" : "text-gray-400 opacity-0 group-hover:opacity-100 hover:text-amber-500",
        ].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavourite();
        }}
        aria-label={isFavourite ? "Unfavourite" : "Favourite"}
        title={isFavourite ? "Unfavourite" : "Favourite"}
      >
        {isFavourite ? "★" : "☆"}
      </button>
      <span className="flex-1 truncate">{template.name}</span>
      {(template.is_default_trade || template.is_default_journal) && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-600">
          Default
        </span>
      )}
    </div>
  );
}
