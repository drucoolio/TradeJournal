/**
 * /api/playbooks — CRUD API for the Strategy Playbook Library.
 *
 * Playbooks are detailed strategy definitions that a trader creates to
 * codify their trading setups. Each playbook describes a specific strategy
 * (e.g. "Bull Flag Breakout", "London Open Scalp") with entry/exit rules,
 * ideal market conditions, timeframes, and expected risk-reward ratio.
 *
 * ROLE IN THE JOURNAL SYSTEM:
 *   - Trades can be linked to a playbook via trades.playbook_id, enabling
 *     per-strategy analytics (win rate, avg P&L, expectancy per setup).
 *   - This is the core of "strategy-based journaling" — instead of just
 *     reviewing P&L, traders can see which strategies perform best.
 *   - Active playbooks appear in the trade journal's playbook selector;
 *     inactive ones are preserved for historical trade references.
 *
 * ENDPOINTS:
 *   GET    /api/playbooks           — list all playbooks for the current user
 *   POST   /api/playbooks           — create a new playbook
 *   PUT    /api/playbooks           — update an existing playbook
 *   DELETE /api/playbooks           — delete a playbook (soft: sets inactive)
 *
 * TABLE SCHEMA (from 004_journal_system.sql):
 *   id                   uuid PK
 *   user_id              uuid FK → auth.users
 *   name                 text NOT NULL
 *   description          text
 *   entry_rules          text (when to enter)
 *   exit_rules           text (when to exit / TP / SL rules)
 *   ideal_conditions     text (market environment for this setup)
 *   timeframes           text[] (e.g. ['M5', 'M15', 'H1'])
 *   default_rr           numeric (target risk:reward ratio)
 *   example_screenshots  text[] (Supabase Storage URLs — future feature)
 *   is_active            boolean DEFAULT true
 *   created_at           timestamptz
 *   updated_at           timestamptz (auto-updated via trigger)
 *   UNIQUE(user_id, name)
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, conflict, serverError, ok, handleSupabaseError } from "@/lib/api-helpers";

/**
 * Valid timeframe values that can be assigned to a playbook.
 * These map to standard MT5/TradingView timeframes.
 * Used for client-side validation reference; not enforced at DB level
 * to allow flexibility for future custom timeframes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VALID_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN"];

/**
 * GET /api/playbooks — returns all playbooks for the logged-in user.
 *
 * Active playbooks appear first, then inactive. Within each group,
 * playbooks are sorted alphabetically by name.
 */
export async function GET() {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { data: playbooks, error } = await supa
    .from("playbooks")
    .select("id, name, description, entry_rules, exit_rules, ideal_conditions, timeframes, default_rr, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return ok({ playbooks });
}

/**
 * POST /api/playbooks — create a new playbook.
 *
 * Expected body: {
 *   name: string (required),
 *   description?: string,
 *   entry_rules?: string,
 *   exit_rules?: string,
 *   ideal_conditions?: string,
 *   timeframes?: string[],
 *   default_rr?: number
 * }
 *
 * Returns the created playbook object.
 */
export async function POST(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json() as {
    name: string;
    description?: string;
    entry_rules?: string;
    exit_rules?: string;
    ideal_conditions?: string;
    timeframes?: string[];
    default_rr?: number;
  };

  // Validate required field
  if (!body.name || !body.name.trim()) {
    return badRequest("Playbook name is required.");
  }

  // Validate default_rr if provided (must be a positive number)
  if (body.default_rr !== undefined && (isNaN(body.default_rr) || body.default_rr <= 0)) {
    return badRequest("Default R:R must be a positive number.");
  }

  const { data: playbook, error } = await supa
    .from("playbooks")
    .insert({
      user_id:          userId,
      name:             body.name.trim(),
      description:      body.description?.trim() || null,
      entry_rules:      body.entry_rules?.trim() || null,
      exit_rules:       body.exit_rules?.trim() || null,
      ideal_conditions: body.ideal_conditions?.trim() || null,
      timeframes:       body.timeframes ?? [],
      default_rr:       body.default_rr ?? null,
      is_active:        true,
    })
    .select("id, name, description, entry_rules, exit_rules, ideal_conditions, timeframes, default_rr, is_active, created_at, updated_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "playbook");
  }

  return ok({ playbook }, 201);
}

/**
 * PUT /api/playbooks — update an existing playbook.
 *
 * Expected body: {
 *   id: string (required),
 *   name?: string,
 *   description?: string,
 *   entry_rules?: string,
 *   exit_rules?: string,
 *   ideal_conditions?: string,
 *   timeframes?: string[],
 *   default_rr?: number | null,
 *   is_active?: boolean
 * }
 *
 * Only provided fields are updated. The updated_at column is automatically
 * refreshed by a DB trigger (playbooks_updated_at).
 */
export async function PUT(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json() as {
    id: string;
    name?: string;
    description?: string;
    entry_rules?: string;
    exit_rules?: string;
    ideal_conditions?: string;
    timeframes?: string[];
    default_rr?: number | null;
    is_active?: boolean;
  };

  if (!body.id) {
    return badRequest("Playbook ID is required.");
  }

  // Validate default_rr if provided and not null
  if (body.default_rr !== undefined && body.default_rr !== null &&
      (isNaN(body.default_rr) || body.default_rr <= 0)) {
    return badRequest("Default R:R must be a positive number.");
  }

  // Build the update object — only include fields that were explicitly sent
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined)             updates.name             = body.name.trim();
  if (body.description !== undefined)      updates.description      = body.description?.trim() || null;
  if (body.entry_rules !== undefined)      updates.entry_rules      = body.entry_rules?.trim() || null;
  if (body.exit_rules !== undefined)       updates.exit_rules       = body.exit_rules?.trim() || null;
  if (body.ideal_conditions !== undefined) updates.ideal_conditions = body.ideal_conditions?.trim() || null;
  if (body.timeframes !== undefined)       updates.timeframes       = body.timeframes;
  if (body.default_rr !== undefined)       updates.default_rr       = body.default_rr;
  if (body.is_active !== undefined)        updates.is_active        = body.is_active;

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  const { data: playbook, error } = await supa
    .from("playbooks")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", userId) // ownership check
    .select("id, name, description, entry_rules, exit_rules, ideal_conditions, timeframes, default_rr, is_active, created_at, updated_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "playbook");
  }

  return ok({ playbook });
}

/**
 * DELETE /api/playbooks — delete a playbook.
 *
 * Expected body: { id: string }
 *
 * IMPORTANT: Trades that reference this playbook via trades.playbook_id
 * have a foreign key with ON DELETE SET NULL, so deleting a playbook will
 * automatically null out the playbook_id on associated trades. The trade
 * data itself is preserved — only the strategy link is removed.
 *
 * For users who want to keep historical data intact, consider using
 * PUT with is_active: false instead of DELETE.
 */
export async function DELETE(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = await req.json() as { id: string };
  if (!id) {
    return badRequest("Playbook ID is required.");
  }

  const { error } = await supa
    .from("playbooks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId); // ownership check

  if (error) {
    return serverError(error.message);
  }

  return ok({ success: true });
}
