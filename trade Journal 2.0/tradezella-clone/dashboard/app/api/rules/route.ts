/**
 * /api/rules — CRUD API for the Personal Trading Rules Engine.
 *
 * Rules are per-user trading discipline rules that the user defines
 * for themselves (e.g. "Never risk more than 2% per trade", "Only trade
 * during London/NY overlap"). They serve two purposes:
 *
 *   1. PRE-SESSION CHECKLIST: Active rules appear as a checklist in the
 *      daily session journal, helping the user commit to their rules
 *      before trading begins.
 *
 *   2. POST-SESSION REVIEW: The daily journal records which rules were
 *      followed and which were broken (via sessions.rules_followed[]
 *      and sessions.rules_broken[] UUID arrays), enabling analytics
 *      on discipline over time.
 *
 * ENDPOINTS:
 *   GET    /api/rules              — list all rules for the current user
 *   POST   /api/rules              — create a new rule
 *   PUT    /api/rules              — update an existing rule (name, description, is_active)
 *   DELETE /api/rules              — delete a rule (requires id in body)
 *
 * TABLE SCHEMA (from 004_journal_system.sql):
 *   id          uuid PK
 *   user_id     uuid FK → auth.users
 *   name        text NOT NULL
 *   description text (optional)
 *   is_active   boolean DEFAULT true  — only active rules show in daily checklist
 *   created_at  timestamptz
 *   UNIQUE(user_id, name)
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, conflict, serverError, ok, handleSupabaseError } from "@/lib/api-helpers";

/**
 * GET /api/rules — returns all rules for the logged-in user.
 *
 * Active rules appear first, then inactive ones. Within each group,
 * rules are sorted alphabetically by name.
 */
export async function GET() {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { data: rules, error } = await supa
    .from("rules")
    .select("id, name, description, is_active, created_at")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })  // active rules first
    .order("name", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return ok({ rules });
}

/**
 * POST /api/rules — create a new trading rule.
 *
 * Expected body: { name: string, description?: string }
 * New rules default to is_active = true (they appear in the daily checklist).
 * Returns the created rule object.
 */
export async function POST(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { name, description } = await req.json() as {
    name: string;
    description?: string;
  };

  // Validate required field
  if (!name || !name.trim()) {
    return badRequest("Rule name is required.");
  }

  const { data: rule, error } = await supa
    .from("rules")
    .insert({
      user_id:     userId,
      name:        name.trim(),
      description: description?.trim() || null,
      is_active:   true, // new rules are active by default
    })
    .select("id, name, description, is_active, created_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "rule");
  }

  return ok({ rule }, 201);
}

/**
 * PUT /api/rules — update an existing rule.
 *
 * Expected body: { id: string, name?: string, description?: string, is_active?: boolean }
 * Only provided fields are updated. Ownership is enforced via user_id filter.
 *
 * The is_active toggle is particularly important: deactivated rules stop
 * appearing in the daily session checklist but are preserved for historical
 * analytics (past sessions that referenced them still have valid data).
 */
export async function PUT(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id, name, description, is_active } = await req.json() as {
    id: string;
    name?: string;
    description?: string;
    is_active?: boolean;
  };

  if (!id) {
    return badRequest("Rule ID is required.");
  }

  // Build the update object — only include fields that were sent
  const updates: Record<string, unknown> = {};
  if (name !== undefined)        updates.name        = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (is_active !== undefined)   updates.is_active   = is_active;

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  const { data: rule, error } = await supa
    .from("rules")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId) // ownership check
    .select("id, name, description, is_active, created_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "rule");
  }

  return ok({ rule });
}

/**
 * DELETE /api/rules — delete a rule.
 *
 * Expected body: { id: string }
 * Ownership is enforced via user_id filter.
 *
 * NOTE: Sessions that reference this rule in their rules_followed[] or
 * rules_broken[] arrays will retain the stale UUID. The UI should handle
 * this gracefully by filtering out unknown IDs.
 */
export async function DELETE(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = await req.json() as { id: string };
  if (!id) {
    return badRequest("Rule ID is required.");
  }

  const { error } = await supa
    .from("rules")
    .delete()
    .eq("id", id)
    .eq("user_id", userId); // ownership check

  if (error) {
    return serverError(error.message);
  }

  return ok({ success: true });
}
