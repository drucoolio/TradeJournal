/**
 * components/editor/toolbar/ListButtons.tsx
 *
 * Bullet list, numbered list, task (checkbox) list, blockquote.
 */

"use client";

import type { Editor } from "@tiptap/react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

export default function ListButtons({ editor }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        label="Task list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        ☐
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ”
      </ToolbarButton>
    </div>
  );
}
