/**
 * lib/editor/serialize.ts — Dependency-free TipTap JSON walkers.
 *
 * Runs on both server (API save paths) and client. Exposes:
 *
 *   extractPlainText(doc) — walks the AST and concatenates all `text`
 *   nodes with newlines between block-level parents. Used to keep the
 *   legacy `notes` text column populated so full-text search and any
 *   existing `ilike '%...%'` queries keep working after the upgrade.
 *
 *   isEmptyDoc(doc) — returns true for null/undefined docs and docs
 *   whose text content is entirely whitespace. Used to decide whether
 *   to auto-insert a default template when opening a note.
 *
 * These helpers intentionally avoid importing from @tiptap/* so they
 * stay usable in server code (route handlers, sync jobs) where the
 * TipTap runtime should not be loaded.
 */

import type { TipTapDoc, TipTapNode } from "./types";

/** Block-level node types that should get a trailing newline in plain text. */
const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "horizontalRule",
  "taskItem",
]);

/**
 * Walks a TipTap JSON doc and returns a flat plain-text representation.
 * Ignores marks and attributes; keeps newlines between block-level
 * parents so the output is readable.
 */
export function extractPlainText(doc: TipTapDoc | null | undefined): string {
  if (!doc || !doc.content) return "";
  const parts: string[] = [];

  const visit = (node: TipTapNode) => {
    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    }
    if (node.content) {
      for (const child of node.content) visit(child);
    }
    // Insert a newline after each block-level node so the plain text
    // breaks sensibly. Consecutive newlines are collapsed at the end.
    if (BLOCK_NODES.has(node.type)) parts.push("\n");
  };

  for (const child of doc.content) visit(child);

  // Collapse runs of 3+ newlines down to 2 for readability
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Returns true if the doc is missing, has no content, or contains
 * only whitespace. Used by the "auto-insert default template on
 * empty note open" flow.
 */
export function isEmptyDoc(doc: TipTapDoc | null | undefined): boolean {
  if (!doc) return true;
  const plain = extractPlainText(doc);
  return plain.trim().length === 0;
}
