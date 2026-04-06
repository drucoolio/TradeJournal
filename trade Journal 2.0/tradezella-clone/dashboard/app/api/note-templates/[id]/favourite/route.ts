/**
 * app/api/note-templates/[id]/favourite/route.ts
 *
 * POST body: { value: boolean }
 *   value=true  → insert into note_template_favourites
 *   value=false → delete from note_template_favourites
 *
 * Separate from the main PATCH endpoint because favouriting a global
 * Recommended template does NOT mutate the template row — it creates
 * a row in the join table scoped to the current user.
 */

import { NextResponse } from "next/server";
import { apiAuth, unauthorized, badRequest } from "@/lib/api-helpers";
import { setFavourite } from "@/lib/noteTemplates";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const value = (body as { value?: unknown }).value;
  if (typeof value !== "boolean") return badRequest("value must be boolean");

  try {
    await setFavourite(ctx.supa, ctx.userId, id, value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[note-templates favourite]", err);
    return NextResponse.json({ error: "Failed to update favourite" }, { status: 500 });
  }
}
