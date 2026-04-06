/**
 * components/editor/toolbar/FontFamilyMenu.tsx
 *
 * Font family picker. Uses the FontFamily extension from
 * @tiptap/extension-text-style.
 *
 * Selection-preservation pattern: snapshot the editor selection when the
 * menu opens, restore it on apply. See FontSizeMenu for why.
 */

"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

const FONTS: Array<{ label: string; value: string | null }> = [
  { label: "Default", value: null },
  { label: "Sans Serif", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Monospace", value: "ui-monospace, SFMono-Regular, monospace" },
  { label: "Inter", value: "Inter, sans-serif" },
];

export default function FontFamilyMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const savedRange = useRef<{ from: number; to: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openMenu = () => {
    const { from, to } = editor.state.selection;
    savedRange.current = { from, to };
    setOpen((v) => !v);
  };

  const apply = (value: string | null) => {
    const range = savedRange.current;
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    if (value === null) chain.unsetFontFamily().run();
    else chain.setFontFamily(value).run();
    savedRange.current = null;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label="Font family"
        active={open}
        onClick={openMenu}
        className="min-w-[3.5rem]"
      >
        Aa<span className="ml-1 text-[9px] opacity-60">▾</span>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {FONTS.map((f) => (
            <button
              key={f.label}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
              style={f.value ? { fontFamily: f.value } : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
