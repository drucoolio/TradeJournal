/**
 * components/editor/toolbar/LinkButton.tsx
 *
 * Inline popover for inserting / editing a link on the current selection.
 *
 * Behaviour:
 *  - If the cursor is inside an existing link, the popover pre-fills with the
 *    current href and exposes an "Unlink" button.
 *  - If there IS a selection, the popover only asks for the URL and applies
 *    the link mark over the selected text (extendMarkRange first so you don't
 *    get a partial mark when the caret is mid-word).
 *  - If the selection is collapsed (no text selected), the popover also asks
 *    for display text and inserts `<text>` with the link mark. This is the
 *    case most users hit first and the old window.prompt() silently failed
 *    on it.
 *
 * URL normalisation: if the user types "example.com" we prepend "https://"
 * so the link is actually clickable.
 */

"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import ToolbarButton from "./ToolbarButton";

interface Props {
  editor: Editor;
}

const normaliseUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Leave mailto:, tel:, anchors and protocol-relative URLs alone.
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export default function LinkButton({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const isActive = editor.isActive("link");

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Autofocus the URL field when opening.
  useEffect(() => {
    if (open) {
      // Small timeout so the input is actually mounted.
      const id = window.setTimeout(() => urlInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const openPopover = () => {
    const { from, to, empty } = editor.state.selection;
    const prevHref = (editor.getAttributes("link").href as string | undefined) ?? "";
    setUrl(prevHref);
    if (empty) {
      // Collapsed caret — ask for the display text too.
      setText("");
    } else {
      // There's a real selection. Pre-fill the text field with it so the
      // user can also edit the label if they want.
      const selected = editor.state.doc.textBetween(from, to, " ");
      setText(selected);
    }
    setOpen(true);
  };

  const apply = () => {
    const href = normaliseUrl(url);
    if (!href) {
      // Empty URL = remove link.
      editor.chain().focus().unsetLink().run();
      setOpen(false);
      return;
    }

    const { empty } = editor.state.selection;

    if (empty && !isActive) {
      // No selection: insert the display text as a new linked fragment.
      const label = text.trim() || href;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      // Selection (or caret inside existing link): apply link to the range.
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    }
    setOpen(false);
  };

  const unlink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label={isActive ? "Edit link" : "Add link"}
        active={isActive || open}
        onClick={openPopover}
      >
        🔗
      </ToolbarButton>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {editor.state.selection.empty && !isActive && (
            <label className="mb-2 block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
                Text
              </span>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Link text"
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    urlInputRef.current?.focus();
                  }
                }}
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
              URL
            </span>
            <input
              ref={urlInputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
            />
          </label>
          <div className="mt-3 flex items-center justify-end gap-1.5">
            {isActive && (
              <button
                type="button"
                onClick={unlink}
                className="mr-auto rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                Unlink
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
            >
              {isActive ? "Update" : "Add link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
