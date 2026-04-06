/**
 * components/editor/RichNoteEditor.tsx
 *
 * PUBLIC wrapper around the TipTap editor.
 *
 * Why this file exists separately from RichNoteEditorImpl.tsx:
 *   - The real editor pulls in ~200KB of ProseMirror + TipTap code and cannot
 *     run on the server (it touches `window` during initialisation).
 *   - next/dynamic({ ssr: false }) guarantees the bundle is only fetched in the
 *     browser and is code-split from the page chunk.
 *   - Callers (TradeJournalPanel, DailyJournal, TemplateEditorModal) import
 *     THIS file as a normal component and never have to think about dynamic().
 *
 * The props here define the stable public contract of the editor. If you need
 * to add a feature, add it here AND in RichNoteEditorImpl — so the types and
 * the implementation evolve together.
 */

"use client";

import dynamic from "next/dynamic";
import type { TipTapDoc } from "@/lib/editor/types";

export interface RichNoteEditorProps {
  /** Current document value (TipTap JSON). Undefined or null → empty doc. */
  value: TipTapDoc | null | undefined;

  /**
   * Called on every change with the new JSON, a rendered HTML snapshot, and
   * a plain-text projection. The caller decides whether to debounce / persist.
   */
  onChange: (payload: {
    json: TipTapDoc;
    html: string;
    text: string;
  }) => void;

  /** Placeholder text shown when empty. Defaults to "Write a note…". */
  placeholder?: string;

  /** Optional classname applied to the outer wrapper. */
  className?: string;

  /**
   * Marks the editor as read-only. Used when rendering historical notes
   * we don't want the user to accidentally mutate.
   */
  readOnly?: boolean;

  /**
   * Hides the toolbar entirely. Useful for very compact contexts or when a
   * parent surface renders its own chrome.
   */
  hideToolbar?: boolean;

  /**
   * If true, the editor stretches to fill its parent. If false, height is
   * driven by content with a sensible min-height.
   */
  fill?: boolean;
}

// ssr: false is important — @tiptap/react touches window during init.
const RichNoteEditorImpl = dynamic(() => import("./RichNoteEditorImpl"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[180px] animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
  ),
});

export default function RichNoteEditor(props: RichNoteEditorProps) {
  return <RichNoteEditorImpl {...props} />;
}
