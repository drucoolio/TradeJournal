/**
 * app/api/note-templates/[id]/duplicate/route.ts
 *
 * POST → { template: DbNoteTemplate }
 *
 * Copies an existing template (typically a global Recommended row)
 * into the caller's own library. The new row is owned by the caller
 * and gets "(copy)" appended to its name.
 */

import { NextResponse } from "next/server";
import { apiAuth, unauthorized } from "@/lib/api-helpers";
import { duplicateTemplate } from "@/lib/noteTemplates";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  try {
    const template = await duplicateTemplate(ctx.supa, ctx.userId, id);
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[note-templates duplicate]", err);
    return NextResponse.json({ error: "Failed to duplicate template" }, { status: 500 });
  }
}
