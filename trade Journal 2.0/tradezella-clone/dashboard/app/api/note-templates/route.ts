/**
 * app/api/note-templates/route.ts — list + create.
 *
 *   GET  /api/note-templates
 *        → { templates: DbNoteTemplate[], favouriteIds: string[] }
 *          Thanks to RLS, the list already includes the caller's own
 *          templates plus global Recommended rows.
 *
 *   POST /api/note-templates
 *        body: { name: string, content_json: TipTapDoc, content_html: string }
 *        → { template: DbNoteTemplate }
 *
 * This file is intentionally thin — all logic is in lib/noteTemplates.
 */

import { NextResponse } from "next/server";
import { apiAuth, unauthorized, badRequest } from "@/lib/api-helpers";
import {
  listTemplates,
  listFavouriteIds,
  createTemplate,
} from "@/lib/noteTemplates";

export async function GET() {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();

  try {
    const [templates, favouriteIds] = await Promise.all([
      listTemplates(ctx.supa),
      listFavouriteIds(ctx.supa, ctx.userId),
    ]);
    return NextResponse.json({ templates, favouriteIds });
  } catch (err) {
    console.error("[note-templates GET]", err);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const b = body as {
    name?: string;
    content_json?: unknown;
    content_html?: string;
  };
  if (!b.name || typeof b.name !== "string") {
    return badRequest("name is required");
  }
  if (!b.content_json || typeof b.content_json !== "object") {
    return badRequest("content_json is required");
  }
  if (typeof b.content_html !== "string") {
    return badRequest("content_html is required");
  }

  try {
    const template = await createTemplate(ctx.supa, ctx.userId, {
      name: b.name.trim(),
      // The schema uses `TipTapDoc` but we accept any object shape here
      // and let the DB's jsonb column store it verbatim.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content_json: b.content_json as any,
      content_html: b.content_html,
    });
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[note-templates POST]", err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
