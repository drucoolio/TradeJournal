/**
 * components/editor/toolbar/ColorMenu.tsx
 *
 * Text color swatch picker. Uses the Color extension from
 * @tiptap/extension-text-style.
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
  "#111827", // gray-900
  "#6b7280", // gray-500
  "#dc2626", // red-600
  "#ea580c", // orange-600
  "#d97706", // amber-600
  "#16a34a", // green-600
  "#0891b2", // cyan-600
  "#2563eb", // blue-600
  "#4f46e5", // indigo-600
  "#9333ea", // purple-600
  "#db2777", // pink-600
] as const;

export default function ColorMenu({ editor }: Props) {
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

  const current = editor.getAttributes("textStyle").color as string | undefined;

  const openMenu = () => {
    const { from, to } = editor.state.selection;
    savedRange.current = { from, to };
    setOpen((v) => !v);
  };

  const apply = (hex: string | null) => {
    const range = savedRange.current;
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    if (hex === null) chain.unsetColor().run();
    else chain.setColor(hex).run();
    savedRange.current = null;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label="Text color"
        active={open}
        onClick={openMenu}
      >
        <span className="flex flex-col items-center leading-none">
          <span>A</span>
          <span
            className="mt-0.5 h-0.5 w-3 rounded"
            style={{ backgroundColor: current ?? "#6b7280" }}
          />
        </span>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
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
