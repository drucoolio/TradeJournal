/**
 * components/editor/toolbar/UndoRedo.tsx
 *
 * Undo / redo buttons backed by TipTap's built-in history.
 */

"use client";

import type { Editor } from "@tiptap/react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

export default function UndoRedo({ editor }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      <ToolbarButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </ToolbarButton>
    </div>
  );
}
