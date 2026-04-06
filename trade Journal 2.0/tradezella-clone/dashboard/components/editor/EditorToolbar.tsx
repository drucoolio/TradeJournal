/**
 * components/editor/EditorToolbar.tsx
 *
 * Pure UI container that arranges toolbar buttons in groups with separators.
 * It does NOT own the TipTap editor — the parent (RichNoteEditorImpl or the
 * TemplateEditorModal) passes it in. This keeps the toolbar reusable across
 * every editor mount.
 */

"use client";

import type { Editor } from "@tiptap/react";
import UndoRedo from "./toolbar/UndoRedo";
import HeadingMenu from "./toolbar/HeadingMenu";
import FontFamilyMenu from "./toolbar/FontFamilyMenu";
import FontSizeMenu from "./toolbar/FontSizeMenu";
import MarkButtons from "./toolbar/MarkButtons";
import ColorMenu from "./toolbar/ColorMenu";
import HighlightMenu from "./toolbar/HighlightMenu";
import ListButtons from "./toolbar/ListButtons";
import AlignButtons from "./toolbar/AlignButtons";
import LinkButton from "./toolbar/LinkButton";
import ImageButton from "./toolbar/ImageButton";

interface Props {
  editor: Editor;
  /** Optional slot for extra buttons (e.g. Templates ▾ dropdown). */
  right?: React.ReactNode;
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-gray-200" />;
}

export default function EditorToolbar({ editor, right }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-gray-200 bg-gray-50 px-2 py-1.5">
      <UndoRedo editor={editor} />
      <Sep />
      <HeadingMenu editor={editor} />
      <FontFamilyMenu editor={editor} />
      <FontSizeMenu editor={editor} />
      <Sep />
      <MarkButtons editor={editor} />
      <Sep />
      <ColorMenu editor={editor} />
      <HighlightMenu editor={editor} />
      <Sep />
      <ListButtons editor={editor} />
      <Sep />
      <AlignButtons editor={editor} />
      <Sep />
      <LinkButton editor={editor} />
      <ImageButton editor={editor} />
      {right && (
        <>
          <span className="ml-auto" />
          {right}
        </>
      )}
    </div>
  );
}
