/**
 * /api/tags — CRUD API for user-defined tags.
 *
 * Tags are per-user and categorized. Each tag has a name, color, and category.
 * Tags are used throughout the journal system: on trades, in filters, and in analytics.
 *
 * ENDPOINTS:
 *   GET    /api/tags              — list all tags for the current user
 *   POST   /api/tags              — create a new tag
 *   PUT    /api/tags              — update an existing tag (requires id in body)
 *   DELETE /api/tags              — delete a tag (requires id in body)
 *
 * CATEGORIES:
 *   strategy, emotion, market_condition, mistake, custom
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, conflict, serverError, ok, handleSupabaseError } from "@/lib/api-helpers";

// Valid tag categories — enforced both in DB constraint and here
const VALID_CATEGORIES = ["strategy", "emotion", "market_condition", "mistake", "custom"];

/**
 * GET /api/tags — returns all tags for the logged-in user.
 * Ordered alphabetically by name within each category.
 */
export async function GET() {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { data: tags, error } = await supa
    .from("tags")
    .select("id, name, color, category, created_at")
    .eq("user_id", userId)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return ok({ tags });
}

/**
 * POST /api/tags — create a new tag.
 *
 * Expected body: { name: string, color?: string, category?: string }
 * Returns the created tag object.
 */
export async function POST(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { name, color, category } = await req.json() as {
    name: string;
    color?: string;
    category?: string;
  };

  if (!name || !name.trim()) {
    return badRequest("Tag name is required.");
  }

  // Validate category if provided
  const cat = category ?? "custom";
  if (!VALID_CATEGORIES.includes(cat)) {
    return badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  const { data: tag, error } = await supa
    .from("tags")
    .insert({
      user_id:  userId,
      name:     name.trim(),
      color:    color ?? "#6366f1", // default indigo
      category: cat,
    })
    .select("id, name, color, category, created_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "tag");
  }

  return ok({ tag }, 201);
}

/**
 * PUT /api/tags — update an existing tag.
 *
 * Expected body: { id: string, name?: string, color?: string, category?: string }
 * Only provided fields are updated.
 */
export async function PUT(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id, name, color, category } = await req.json() as {
    id: string;
    name?: string;
    color?: string;
    category?: string;
  };

  if (!id) {
    return badRequest("Tag ID is required.");
  }

  // Validate category if provided
  if (category && !VALID_CATEGORIES.includes(category)) {
    return badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  // Build the update object — only include fields that were sent
  const updates: Record<string, unknown> = {};
  if (name !== undefined)     updates.name     = name.trim();
  if (color !== undefined)    updates.color    = color;
  if (category !== undefined) updates.category = category;

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  const { data: tag, error } = await supa
    .from("tags")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId) // ensure the user owns this tag
    .select("id, name, color, category, created_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "tag");
  }

  return ok({ tag });
}

/**
 * DELETE /api/tags — delete a tag.
 *
 * Expected body: { id: string }
 * Also removes this tag from any trades that reference it in their tags[] array.
 */
export async function DELETE(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = await req.json() as { id: string };
  if (!id) {
    return badRequest("Tag ID is required.");
  }

  // First, get the tag name so we can remove it from trades' tags[] arrays
  const { data: tag } = await supa
    .from("tags")
    .select("name")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!tag) {
    return ok({ message: "Tag not found." }, 404);
  }

  // Delete the tag row
  const { error } = await supa
    .from("tags")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return serverError(error.message);
  }

  return ok({ success: true });
}
