/**
 * /api/mistakes — CRUD API for the Mistake Library.
 *
 * Mistakes are per-user entries that represent common trading errors.
 * When a user first creates a mistake (if they have none), we seed their
 * library with a curated set of defaults (is_default = true).
 *
 * Trades can reference multiple mistake IDs via the trades.mistake_ids[]
 * column, enabling analytics like "most frequent mistakes" and
 * "P&L impact per mistake".
 *
 * ENDPOINTS:
 *   GET    /api/mistakes              — list all mistakes for the current user
 *   POST   /api/mistakes              — create a new mistake (seeds defaults on first use)
 *   PUT    /api/mistakes              — update an existing mistake (requires id in body)
 *   DELETE /api/mistakes              — delete a mistake (requires id in body)
 *
 * TABLE SCHEMA (from 004_journal_system.sql):
 *   id          uuid PK
 *   user_id     uuid FK → auth.users
 *   name        text NOT NULL
 *   description text (optional longer explanation)
 *   is_default  boolean (true for seeded defaults)
 *   created_at  timestamptz
 *   UNIQUE(user_id, name)
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, conflict, serverError, ok, handleSupabaseError } from "@/lib/api-helpers";

/**
 * Default mistakes seeded for new users on their first interaction.
 * These cover the most common trading errors identified in trading psychology
 * literature and community feedback. Users can edit/delete these freely.
 */
const DEFAULT_MISTAKES = [
  { name: "Moved stop loss",              description: "Moved stop loss further away from entry, increasing risk beyond the original plan." },
  { name: "Oversized position",           description: "Entered a position larger than the risk management rules allow." },
  { name: "FOMO entry",                   description: "Entered a trade out of fear of missing out, without proper setup confirmation." },
  { name: "Revenge trade",                description: "Took a trade to recover losses from a previous losing trade, bypassing normal analysis." },
  { name: "Traded against trend",         description: "Entered against the prevailing market trend without strong counter-trend setup." },
  { name: "Early exit",                   description: "Closed a winning trade too early, missing the majority of the planned move." },
  { name: "Didn't take profit at target", description: "Held past the planned take-profit level, giving back unrealized gains." },
  { name: "Entered too late",             description: "Entered after the optimal entry point, resulting in worse risk-reward ratio." },
  { name: "No stop loss",                 description: "Entered a trade without setting a stop loss, exposing the account to unlimited risk." },
  { name: "Broke max daily loss rule",    description: "Continued trading after hitting the maximum daily loss limit." },
  { name: "Traded during news",           description: "Took a trade during a high-impact news event without accounting for volatility." },
  { name: "Overtraded",                   description: "Took more trades than planned, often resulting in lower quality setups." },
];

/**
 * Seeds the default mistake library for a new user.
 *
 * Called automatically when we detect the user has zero mistakes.
 * Each default is flagged with is_default = true so the UI can
 * optionally distinguish them from user-created ones.
 *
 * Uses upsert with onConflict to gracefully handle the edge case
 * where a partial seed previously ran (e.g. network interruption).
 */
async function seedDefaults(userId: string, supa: any) {
  const rows = DEFAULT_MISTAKES.map((m) => ({
    user_id:    userId,
    name:       m.name,
    description: m.description,
    is_default: true,
  }));

  // Insert all defaults; ignore conflicts if some already exist
  await supa.from("mistakes").upsert(rows, { onConflict: "user_id,name" });
}

/**
 * GET /api/mistakes — returns all mistakes for the logged-in user.
 *
 * If the user has zero mistakes, seeds the default library first.
 * Results are ordered alphabetically by name for consistent display.
 */
export async function GET() {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  // Check if user has any mistakes — if not, seed defaults
  const { count } = await supa
    .from("mistakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (count === 0) {
    await seedDefaults(userId, supa);
  }

  // Fetch all mistakes for this user
  const { data: mistakes, error } = await supa
    .from("mistakes")
    .select("id, name, description, is_default, created_at")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    return serverError(error.message);
  }

  return ok({ mistakes });
}

/**
 * POST /api/mistakes — create a new custom mistake.
 *
 * Expected body: { name: string, description?: string }
 * Returns the created mistake object.
 *
 * If the user has no mistakes yet, seeds defaults first to ensure
 * the library is populated before adding the custom entry.
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
    return badRequest("Mistake name is required.");
  }

  // Seed defaults if this is the user's first mistake creation
  const { count } = await supa
    .from("mistakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (count === 0) {
    await seedDefaults(userId, supa);
  }

  // Insert the new custom mistake
  const { data: mistake, error } = await supa
    .from("mistakes")
    .insert({
      user_id:     userId,
      name:        name.trim(),
      description: description?.trim() || null,
      is_default:  false, // user-created mistakes are never defaults
    })
    .select("id, name, description, is_default, created_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "mistake");
  }

  return ok({ mistake }, 201);
}

/**
 * PUT /api/mistakes — update an existing mistake.
 *
 * Expected body: { id: string, name?: string, description?: string }
 * Only provided fields are updated. Ownership is enforced via user_id filter.
 */
export async function PUT(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id, name, description } = await req.json() as {
    id: string;
    name?: string;
    description?: string;
  };

  if (!id) {
    return badRequest("Mistake ID is required.");
  }

  // Build the update object — only include fields that were sent
  const updates: Record<string, unknown> = {};
  if (name !== undefined)        updates.name        = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  const { data: mistake, error } = await supa
    .from("mistakes")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId) // ownership check — users can only edit their own
    .select("id, name, description, is_default, created_at")
    .single();

  if (error) {
    return handleSupabaseError(error, "mistake");
  }

  return ok({ mistake });
}

/**
 * DELETE /api/mistakes — delete a mistake.
 *
 * Expected body: { id: string }
 * Ownership is enforced via user_id filter.
 *
 * NOTE: Trades that reference this mistake in their mistake_ids[] array
 * will retain the stale UUID. The UI should handle this gracefully by
 * filtering out unknown IDs when displaying mistake references on trades.
 * A future migration could add a cleanup trigger if needed at scale.
 */
export async function DELETE(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = await req.json() as { id: string };
  if (!id) {
    return badRequest("Mistake ID is required.");
  }

  const { error } = await supa
    .from("mistakes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId); // ownership check

  if (error) {
    return serverError(error.message);
  }

  return ok({ success: true });
}
