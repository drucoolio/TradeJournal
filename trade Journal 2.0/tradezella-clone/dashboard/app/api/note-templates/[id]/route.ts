/**
 * app/api/note-templates/[id]/route.ts — PATCH + DELETE one template.
 *
 * RLS blocks cross-user writes, so these routes don't need to
 * manually re-check ownership — the query will simply not match any
 * row if the template belongs to another user, and Supabase returns
 * a "not found" error that we surface as 404.
 */

import { NextResponse } from "next/server";
import { apiAuth, unauthorized, badRequest } from "@/lib/api-helpers";
import { updateTemplate, deleteTemplate } from "@/lib/noteTemplates";

export async function PATCH(
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

  const b = body as {
    name?: string;
    content_json?: unknown;
    content_html?: string;
  };

  try {
    const template = await updateTemplate(ctx.supa, id, {
      name: typeof b.name === "string" ? b.name.trim() : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content_json: b.content_json as any,
      content_html: typeof b.content_html === "string" ? b.content_html : undefined,
    });
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[note-templates PATCH]", err);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  try {
    await deleteTemplate(ctx.supa, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[note-templates DELETE]", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
