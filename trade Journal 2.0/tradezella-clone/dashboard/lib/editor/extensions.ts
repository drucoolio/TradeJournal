/**
 * lib/editor/extensions.ts
 *
 * Centralized TipTap extension bundle. This is the SINGLE SOURCE OF TRUTH for
 * which features the rich note editor supports. Add or remove an extension
 * here and every editor instance (inline RichNoteEditor, the TemplateEditorModal,
 * any future read-only renderer) picks it up automatically.
 *
 * Why a factory function and not a module-level constant?
 *   - Placeholder text differs per mount (trade note vs journal note vs template).
 *   - Image click handlers / upload hooks may be wired differently per mount.
 *   - TipTap editors mutate extension state, so we give each editor its own array.
 *
 * NOTE ON TIPTAP v3:
 *   - StarterKit already includes Bold, Italic, Strike, Code, CodeBlock, Heading,
 *     BulletList, OrderedList, ListItem, Blockquote, HardBreak, HorizontalRule,
 *     Link, Underline, UndoRedo, Dropcursor, Gapcursor, TrailingNode.
 *   - @tiptap/extension-text-style now exports Color, FontFamily, FontSize,
 *     BackgroundColor, LineHeight, Highlight as sub-extensions. We import from
 *     there to keep the version surface consistent.
 */

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
} from "@tiptap/extension-text-style";

export interface BuildExtensionsOptions {
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
}

/**
 * Returns a fresh extension array for a single editor instance.
 * Call this once per mount — each editor needs its own array.
 */
export function buildExtensions(opts: BuildExtensionsOptions = {}) {
  const { placeholder = "Write a note…" } = opts;

  return [
    StarterKit.configure({
      // Link is inside StarterKit in v3; we want it to open in new tab and be clickable.
      link: {
        openOnClick: false,
        HTMLAttributes: {
          class: "text-indigo-400 underline hover:text-indigo-300",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      },
      // Keep heading levels 1-3 — anything deeper is overkill for notes.
      heading: {
        levels: [1, 2, 3],
      },
    }),
    // Colors and typography (all ride on top of the TextStyle mark).
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    // Highlight with color picker support.
    Highlight.configure({ multicolor: true }),
    // Paragraph alignment.
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    // Images. `src` is a Supabase Storage path in our DB; we swap it for a
    // signed URL at render time via the useImageUpload hook.
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: "rounded-lg border border-white/10 max-w-full h-auto my-2",
      },
    }),
    // Checklist support for templates like "Pre-market prep".
    TaskList.configure({
      HTMLAttributes: {
        class: "not-prose space-y-1 pl-0",
      },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class: "flex items-start gap-2",
      },
    }),
    Placeholder.configure({
      placeholder,
      emptyEditorClass: "is-editor-empty",
    }),
  ];
}
