/**
 * lib/editor/defaults.ts — Canonical empty-document factory.
 *
 * Every caller that needs a blank TipTap document imports from here.
 * This gives us one place to tweak the default shape (e.g. if we ever
 * decide blank docs should contain a single empty heading instead of
 * an empty paragraph).
 */

import type { TipTapDoc } from "./types";

/** Returns a fresh blank TipTap document. */
export function emptyDoc(): TipTapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}
