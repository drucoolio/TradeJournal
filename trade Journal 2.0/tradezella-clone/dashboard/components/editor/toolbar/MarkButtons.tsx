/**
 * components/editor/toolbar/MarkButtons.tsx
 *
 * Inline-mark toggles: Bold, Italic, Underline, Strike, Code.
 * Each button lives in this one module because they're so similar that
 * splitting them would be noise; but the group is still isolated from other
 * toolbar concerns (headings, lists, colors).
 */

"use client";

import type { Editor } from "@tiptap/react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

export default function MarkButtons({ editor }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <span className="font-mono text-[11px]">{`<>`}</span>
      </ToolbarButton>
    </div>
  );
}
