/**
 * /api/tag-categories — CRUD for the modular tag-category system.
 *
 * A tag category is a user-defined field with a `field_type` (multi_select,
 * single_select, star_rating, slider, yes_no, short_text). Options for
 * multi/single select categories live under /api/tag-categories/[id]/options.
 *
 * ENDPOINTS:
 *   GET    /api/tag-categories       — list all categories (+ their options) for the user
 *   POST   /api/tag-categories       — create a new category
 *   PUT    /api/tag-categories       — update an existing category (id in body)
 *   DELETE /api/tag-categories       — delete a category (id in body, cascades to options+values)
 *
 * REORDER: PUT with { id, position } updates a single row's position. The client
 * issues one PUT per moved row after a drag-and-drop event. Cheap and correct.
 */

import { NextRequest } from "next/server";
import {
  apiAuth, unauthorized, badRequest, ok, serverError, handleSupabaseError,
} from "@/lib/api-helpers";
import {
  DEFAULT_CONFIG, FIELD_TYPES, type FieldType, type CategoryConfig,
} from "@/lib/tagCategories/types";

function isValidFieldType(v: unknown): v is FieldType {
  return typeof v === "string" && (FIELD_TYPES as string[]).includes(v);
}

/**
 * GET /api/tag-categories
 * Returns `{ categories, options }` where categories is ordered by position
 * and options is a flat list keyed by category_id on the client.
 */
export async function GET() {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { data: categories, error: catErr } = await supa
    .from("tag_categories")
    .select("id, user_id, name, icon, color, field_type, config, position, created_at, updated_at")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (catErr) return serverError(catErr.message);

  const categoryIds = (categories ?? []).map((c) => c.id);
  let options: unknown[] = [];
  if (categoryIds.length > 0) {
    const { data: opts, error: optErr } = await supa
      .from("tag_options")
      .select("id, category_id, label, color, position, created_at")
      .in("category_id", categoryIds)
      .order("position", { ascending: true });
    if (optErr) return serverError(optErr.message);
    options = opts ?? [];
  }

  return ok({ categories: categories ?? [], options });
}

/**
 * POST /api/tag-categories
 * Body: { name, field_type, icon?, color?, config?, position? }
 */
export async function POST(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = (await req.json()) as {
    name?: string;
    field_type?: string;
    icon?: string | null;
    color?: string;
    config?: CategoryConfig;
    position?: number;
  };

  if (!body.name || !body.name.trim()) {
    return badRequest("Category name is required.");
  }
  if (!isValidFieldType(body.field_type)) {
    return badRequest(`Invalid field_type. Must be one of: ${FIELD_TYPES.join(", ")}`);
  }

  // Determine next position if not provided: append to end.
  let position = body.position;
  if (position == null) {
    const { data: maxRow } = await supa
      .from("tag_categories")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (maxRow?.position ?? -1) + 1;
  }

  const { data: category, error } = await supa
    .from("tag_categories")
    .insert({
      user_id:    userId,
      name:       body.name.trim(),
      icon:       body.icon ?? null,
      color:      body.color ?? "#6366f1",
      field_type: body.field_type,
      config:     body.config ?? DEFAULT_CONFIG[body.field_type],
      position,
    })
    .select("id, user_id, name, icon, color, field_type, config, position, created_at, updated_at")
    .single();

  if (error) return handleSupabaseError(error, "tag_category");
  return ok({ category }, 201);
}

/**
 * PUT /api/tag-categories
 * Body: { id, name?, icon?, color?, config?, position? }
 * field_type cannot be changed after creation — different types need
 * different value shapes and migrating mid-flight would break historical data.
 */
export async function PUT(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = (await req.json()) as {
    id?: string;
    name?: string;
    icon?: string | null;
    color?: string;
    config?: CategoryConfig;
    position?: number;
  };

  if (!body.id) return badRequest("Category ID is required.");

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined)     updates.name     = body.name.trim();
  if (body.icon !== undefined)     updates.icon     = body.icon;
  if (body.color !== undefined)    updates.color    = body.color;
  if (body.config !== undefined)   updates.config   = body.config;
  if (body.position !== undefined) updates.position = body.position;

  if (Object.keys(updates).length === 1) {
    return badRequest("Nothing to update.");
  }

  const { data: category, error } = await supa
    .from("tag_categories")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", userId)
    .select("id, user_id, name, icon, color, field_type, config, position, created_at, updated_at")
    .single();

  if (error) return handleSupabaseError(error, "tag_category");
  return ok({ category });
}

/**
 * DELETE /api/tag-categories
 * Body: { id }
 * Cascades to tag_options and trade_category_values via ON DELETE CASCADE.
 */
export async function DELETE(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = (await req.json()) as { id?: string };
  if (!id) return badRequest("Category ID is required.");

  const { error } = await supa
    .from("tag_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return serverError(error.message);
  return ok({ success: true });
}
