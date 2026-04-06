/**
 * components/editor/toolbar/AlignButtons.tsx
 *
 * Paragraph alignment: left, center, right, justify. Uses inline SVG icons
 * so rendering is font-independent (Unicode align glyphs fall back to boxes
 * on most systems).
 */

"use client";

import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

type Align = "left" | "center" | "right" | "justify";

/**
 * Each icon is a 14×14 SVG with 4 horizontal lines whose lengths/offsets
 * describe the alignment. Using currentColor so the icon inherits the
 * toolbar button's text color (active/idle states).
 */
const AlignIcon = ({ value }: { value: Align }) => {
  const lines: Record<Align, Array<{ x: number; w: number }>> = {
    left:    [{ x: 1, w: 12 }, { x: 1, w: 8 },  { x: 1, w: 12 }, { x: 1, w: 6 }],
    center:  [{ x: 1, w: 12 }, { x: 3, w: 8 },  { x: 1, w: 12 }, { x: 4, w: 6 }],
    right:   [{ x: 1, w: 12 }, { x: 5, w: 8 },  { x: 1, w: 12 }, { x: 7, w: 6 }],
    justify: [{ x: 1, w: 12 }, { x: 1, w: 12 }, { x: 1, w: 12 }, { x: 1, w: 12 }],
  };
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {lines[value].map((ln, i) => (
        <line key={i} x1={ln.x} y1={2 + i * 3} x2={ln.x + ln.w} y2={2 + i * 3} />
      ))}
    </svg>
  );
};

const ITEMS: Array<{ value: Align; label: string; icon: ReactNode }> = [
  { value: "left",    label: "Align left",    icon: <AlignIcon value="left" /> },
  { value: "center",  label: "Align center",  icon: <AlignIcon value="center" /> },
  { value: "right",   label: "Align right",   icon: <AlignIcon value="right" /> },
  { value: "justify", label: "Justify",       icon: <AlignIcon value="justify" /> },
];

export default function AlignButtons({ editor }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {ITEMS.map((it) => (
        <ToolbarButton
          key={it.value}
          label={it.label}
          active={editor.isActive({ textAlign: it.value })}
          onClick={() => editor.chain().focus().setTextAlign(it.value).run()}
        >
          {it.icon}
        </ToolbarButton>
      ))}
    </div>
  );
}
