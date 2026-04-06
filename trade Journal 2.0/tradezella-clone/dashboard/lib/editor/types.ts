/**
 * lib/editor/types.ts — Shared TipTap document + template types.
 *
 * These types intentionally do not import from @tiptap/* so they can
 * be used safely on both server (API routes, server components) and
 * client. TipTap's own `JSONContent` type ships from @tiptap/core; we
 * mirror a permissive subset here to stay dep-free on the server.
 */

/**
 * A permissive shape of a TipTap/ProseMirror JSON document node.
 * Intentionally loose: we only read/walk these docs on the server,
 * we never introspect specific node attrs.
 */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** Top-level TipTap document — always `type: 'doc'` with content array. */
export interface TipTapDoc extends TipTapNode {
  type: "doc";
  content?: TipTapNode[];
}

/** Row shape returned by /api/note-templates list endpoint. */
export interface DbNoteTemplate {
  id: string;
  user_id: string | null;               // null = global Recommended row
  name: string;
  content_json: TipTapDoc;
  content_html: string;
  is_default_trade: boolean;
  is_default_journal: boolean;
  created_at: string;
  updated_at: string;
}

/** Kinds a default template can be pinned for. */
export type NoteKind = "trade" | "journal";
