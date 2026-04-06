/**
 * components/editor/toolbar/ImageButton.tsx
 *
 * Opens a file picker, uploads the selected image via useImageUpload, and
 * inserts an <img> node at the cursor. The heavy lifting lives in the hook
 * — this file is only the toolbar UI and the TipTap insertion command.
 */

"use client";

import type { Editor } from "@tiptap/react";
import { useRef } from "react";
import ToolbarButton from "./ToolbarButton";
import { useImageUpload } from "../useImageUpload";

interface Props {
  editor: Editor;
}

export default function ImageButton({ editor }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload();

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const result = await upload(file);
    if (!result) return;
    editor
      .chain()
      .focus()
      .setImage({ src: result.displayUrl, alt: file.name })
      .run();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFile}
      />
      <ToolbarButton
        label={uploading ? "Uploading…" : "Insert image"}
        disabled={uploading}
        onClick={onPick}
      >
        {uploading ? "…" : "🖼"}
      </ToolbarButton>
    </>
  );
}
