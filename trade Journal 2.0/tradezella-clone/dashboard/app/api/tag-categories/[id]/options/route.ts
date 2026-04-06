/**
 * /api/tag-categories/[id]/options — CRUD for tag_options under a category.
 *
 * Only valid for categories whose field_type is 'multi_select' or
 * 'single_select'. Other types have no options.
 *
 * ENDPOINTS:
 *   GET    /api/tag-categories/[id]/options        — list
 *   POST   /api/tag-categories/[id]/options        — create
 *   PUT    /api/tag-categories/[id]/options        — update (body: { id, label?, color?, position? })
 *   DELETE /api/tag-categories/[id]/options        — delete (body: { id })
 *
 * Reorder: PUT /api/tag-categories/[id]/options/reorder with { order: string[] }.
 */

import { NextRequest } from "next/server";
import {
  apiAuth, unauthorized, badRequest, ok, serverError, handleSupabaseError,
} from "@/lib/api-helpers";

type RouteCtx = { params: Promise<{ id: string }> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireOwnedCategory(supa: any, userId: string, categoryId: string) {
  const { data, error } = await supa
    .from("tag_categories")
    .select("id, field_type")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; field_type: string };
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id } = await ctx.params;

  const cat = await requireOwnedCategory(supa, userId, id);
  if (!cat) return ok({ error: "Not found" }, 404);

  const { data, error } = await supa
    .from("tag_options")
    .select("id, category_id, label, color, position, created_at")
    .eq("category_id", id)
    .order("position", { ascending: true });

  if (error) return serverError(error.message);
  return ok({ options: data ?? [] });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id } = await ctx.params;

  const cat = await requireOwnedCategory(supa, userId, id);
  if (!cat) return ok({ error: "Not found" }, 404);
  if (cat.field_type !== "multi_select" && cat.field_type !== "single_select") {
    return badRequest("Options are only valid for multi_select or single_select categories.");
  }

  const body = (await req.json()) as { label?: string; color?: string; position?: number };
  if (!body.label || !body.label.trim()) return badRequest("Option label is required.");

  let position = body.position;
  if (position == null) {
    const { data: maxRow } = await supa
      .from("tag_options")
      .select("position")
      .eq("category_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (maxRow?.position ?? -1) + 1;
  }

  const { data: option, error } = await supa
    .from("tag_options")
    .insert({
      category_id: id,
      label:       body.label.trim(),
      color:       body.color ?? "#6366f1",
      position,
    })
    .select("id, category_id, label, color, position, created_at")
    .single();

  if (error) return handleSupabaseError(error, "tag_option");
  return ok({ option }, 201);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id: categoryId } = await ctx.params;

  const cat = await requireOwnedCategory(supa, userId, categoryId);
  if (!cat) return ok({ error: "Not found" }, 404);

  const body = (await req.json()) as {
    id?: string; label?: string; color?: string; position?: number;
  };
  if (!body.id) return badRequest("Option ID is required.");

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined)    updates.label    = body.label.trim();
  if (body.color !== undefined)    updates.color    = body.color;
  if (body.position !== undefined) updates.position = body.position;

  if (Object.keys(updates).length === 0) return badRequest("Nothing to update.");

  const { data: option, error } = await supa
    .from("tag_options")
    .update(updates)
    .eq("id", body.id)
    .eq("category_id", categoryId)
    .select("id, category_id, label, color, position, created_at")
    .single();

  if (error) return handleSupabaseError(error, "tag_option");
  return ok({ option });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id: categoryId } = await ctx.params;

  const cat = await requireOwnedCategory(supa, userId, categoryId);
  if (!cat) return ok({ error: "Not found" }, 404);

  const { id } = (await req.json()) as { id?: string };
  if (!id) return badRequest("Option ID is required.");

  const { error } = await supa
    .from("tag_options")
    .delete()
    .eq("id", id)
    .eq("category_id", categoryId);

  if (error) return serverError(error.message);
  return ok({ success: true });
}
