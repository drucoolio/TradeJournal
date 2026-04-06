/**
 * app/api/note-templates/[id]/default/route.ts
 *
 * POST body: { kind: 'trade' | 'journal', value: boolean }
 *
 * Pins or unpins the template as the caller's default for the given
 * kind. If the target is a global Recommended template (user_id is
 * null), we first duplicate it into the user's library, then pin the
 * new row. The duplicated template's id is returned so the client
 * can update its local state.
 *
 * NOTE: Pinning a new default first clears any existing default of
 * the same kind to satisfy the partial unique index. That transition
 * lives in lib/noteTemplates.ts `setDefaultTemplate`.
 */

import { NextResponse } from "next/server";
import { apiAuth, unauthorized, badRequest } from "@/lib/api-helpers";
import {
  setDefaultTemplate,
  duplicateTemplate,
} from "@/lib/noteTemplates";
import type { NoteKind } from "@/lib/editor/types";

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
  const b = body as { kind?: unknown; value?: unknown };
  if (b.kind !== "trade" && b.kind !== "journal") {
    return badRequest("kind must be 'trade' or 'journal'");
  }
  if (typeof b.value !== "boolean") return badRequest("value must be boolean");
  const kind = b.kind as NoteKind;
  const value = b.value;

  try {
    // Check if this template is a global (Recommended) row. We need the
    // owner_id to decide whether to duplicate first. RLS still lets us
    // read global rows, so this fetch works without a service-role escape.
    const { data: row, error } = await ctx.supa
      .from("note_templates")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (error) throw error;

    let targetId = id;
    if (value && row.user_id === null) {
      // Pinning a Recommended template → duplicate into the user's library
      // first so the flag has a row to live on (RLS forbids writing globals).
      const copy = await duplicateTemplate(ctx.supa, ctx.userId, id);
      targetId = copy.id;
    }

    await setDefaultTemplate(ctx.supa, ctx.userId, targetId, kind, value);
    return NextResponse.json({ ok: true, id: targetId });
  } catch (err) {
    console.error("[note-templates default]", err);
    return NextResponse.json({ error: "Failed to set default" }, { status: 500 });
  }
}
