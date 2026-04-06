/**
 * components/editor/toolbar/FontSizeMenu.tsx
 *
 * Font size picker. Uses the FontSize extension from @tiptap/extension-text-style.
 *
 * Selection-preservation pattern: when the dropdown opens we snapshot the
 * current editor selection, and when an item is clicked we restore it before
 * running the command. This guards against any focus thrash that can happen
 * when a popup menu mounts/unmounts above the editor — `preventDefault` on
 * mousedown alone isn't always enough inside a modal.
 */

"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

const SIZES: Array<{ label: string; value: string | null }> = [
  { label: "Default", value: null },
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "30px", value: "30px" },
  { label: "36px", value: "36px" },
];

export default function FontSizeMenu({ editor }: Props) {
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
    if (value === null) chain.unsetFontSize().run();
    else chain.setFontSize(value).run();
    savedRange.current = null;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label="Font size"
        active={open}
        onClick={openMenu}
        className="min-w-[3rem]"
      >
        A<span className="text-[9px] opacity-60 ml-0.5">▾</span>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-32 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
