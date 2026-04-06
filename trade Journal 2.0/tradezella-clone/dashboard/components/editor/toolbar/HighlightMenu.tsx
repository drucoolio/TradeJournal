/**
 * components/editor/toolbar/HighlightMenu.tsx
 *
 * Highlight / background color swatch picker. Uses the Highlight extension
 * with multicolor enabled.
 */

"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

const SWATCHES = [
  null, // reset
  "#fde68a", // amber
  "#fecaca", // red
  "#bbf7d0", // green
  "#bae6fd", // blue
  "#ddd6fe", // violet
  "#fbcfe8", // pink
] as const;

export default function HighlightMenu({ editor }: Props) {
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

  const apply = (hex: string | null) => {
    const range = savedRange.current;
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    if (hex === null) chain.unsetHighlight().run();
    else chain.setHighlight({ color: hex }).run();
    savedRange.current = null;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label="Highlight"
        active={editor.isActive("highlight") || open}
        onClick={openMenu}
      >
        <span className="rounded px-0.5" style={{ backgroundColor: "#fde68a", color: "#1c1917" }}>H</span>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((s, i) => (
              <button
                key={i}
                type="button"
                className="h-6 w-6 rounded border border-gray-200 hover:scale-110 transition"
                style={s ? { backgroundColor: s } : { backgroundImage: "linear-gradient(45deg, transparent 45%, #f87171 45%, #f87171 55%, transparent 55%)" }}
                title={s ?? "Reset"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
