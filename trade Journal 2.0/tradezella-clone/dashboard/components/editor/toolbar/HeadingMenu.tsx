/**
 * components/editor/toolbar/HeadingMenu.tsx
 *
 * Dropdown that sets paragraph / H1 / H2 / H3 on the current block.
 */

"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

type Level = 1 | 2 | 3;
const OPTIONS: Array<{ label: string; value: "p" | Level }> = [
  { label: "Paragraph", value: "p" },
  { label: "Heading 1", value: 1 },
  { label: "Heading 2", value: 2 },
  { label: "Heading 3", value: 3 },
];

export default function HeadingMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = (() => {
    if (editor.isActive("heading", { level: 1 })) return "H1";
    if (editor.isActive("heading", { level: 2 })) return "H2";
    if (editor.isActive("heading", { level: 3 })) return "H3";
    return "P";
  })();

  const apply = (v: "p" | Level) => {
    if (v === "p") editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: v }).run();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label="Text style"
        active={open}
        onClick={() => setOpen((v) => !v)}
        className="min-w-[3rem]"
      >
        <span>{current}</span>
        <span className="ml-1 text-[9px] opacity-60">▾</span>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
