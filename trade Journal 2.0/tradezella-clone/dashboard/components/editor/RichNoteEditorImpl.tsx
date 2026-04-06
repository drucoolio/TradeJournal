/**
 * components/editor/RichNoteEditorImpl.tsx
 *
 * Real TipTap editor mount. Imported via next/dynamic({ ssr: false }) from
 * RichNoteEditor.tsx — never renders on the server.
 *
 * Responsibilities:
 *   - Instantiate useEditor with the shared extension bundle.
 *   - Sync the `value` prop INTO the editor when it changes from outside
 *     (e.g. template applied, note switched). We diff by stringified JSON
 *     to avoid an infinite loop — setContent would re-fire onUpdate.
 *   - Emit { json, html, text } on every change.
 *   - Render EditorToolbar above the content (unless hideToolbar).
 *
 * Everything UI-related happens in child components; this file glues them.
 */

"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { buildExtensions } from "@/lib/editor/extensions";
import { emptyDoc } from "@/lib/editor/defaults";
import { extractPlainText } from "@/lib/editor/serialize";
import type { TipTapDoc } from "@/lib/editor/types";
import type { RichNoteEditorProps } from "./RichNoteEditor";
import EditorToolbar from "./EditorToolbar";

export default function RichNoteEditorImpl({
  value,
  onChange,
  placeholder,
  className,
  readOnly,
  hideToolbar,
  fill,
}: RichNoteEditorProps) {
  // Build the extensions array once per mount — TipTap stores mutable state
  // on them, so sharing across editors is unsafe.
  const extensions = useMemo(() => buildExtensions({ placeholder }), [placeholder]);

  // Track the last JSON we emitted, so when `value` changes from outside we
  // can decide whether to push it into the editor.
  const lastEmittedRef = useRef<string>("");

  const editor = useEditor({
    extensions,
    content: (value ?? emptyDoc()) as object,
    editable: !readOnly,
    immediatelyRender: false, // avoids Next.js hydration warnings
    editorProps: {
      attributes: {
        class: [
          "prose prose-sm max-w-none focus:outline-none text-gray-900",
          "px-3 py-2.5",
          fill ? "flex-1 overflow-y-auto" : "min-h-[140px]",
        ].join(" "),
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as TipTapDoc;
      const html = editor.getHTML();
      const text = extractPlainText(json);
      lastEmittedRef.current = JSON.stringify(json);
      onChange({ json, html, text });
    },
  });

  // External value → editor sync. Only apply when the incoming JSON differs
  // from what the editor last emitted, otherwise we'd clobber the user's
  // caret position on every keystroke.
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(value ?? emptyDoc());
    if (incoming === lastEmittedRef.current) return;
    if (incoming === JSON.stringify(editor.getJSON())) return;
    editor.commands.setContent((value ?? emptyDoc()) as object, { emitUpdate: false });
    lastEmittedRef.current = incoming;
  }, [editor, value]);

  // Keep `editable` in sync with the readOnly prop.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div
      className={[
        "flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white",
        fill ? "h-full" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!hideToolbar && editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} className={fill ? "flex-1 min-h-0 overflow-y-auto" : ""} />
    </div>
  );
}
