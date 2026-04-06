/**
 * /api/sessions — Daily Session Journal API.
 *
 * Sessions represent a single trading day for a specific account.
 * The sync route auto-creates sessions with trade metrics (total_pnl,
 * trade_count). This API allows users to UPDATE sessions with their
 * daily journal entries — the reflective side of the session.
 *
 * DAILY JOURNAL FIELDS (added by 004_journal_system.sql):
 *   market_conditions  — overview of the day's market environment
 *   went_well          — what went well in today's trading
 *   went_poorly        — what went poorly / needs improvement
 *   takeaways          — key lessons from the day
 *   goals_tomorrow     — goals/intentions for the next trading day
 *   day_rating         — 1-5 overall rating for the day
 *   mood_morning       — mood before trading started
 *   mood_midday        — mood during the session
 *   mood_close         — mood after all trades closed
 *   rules_followed     — UUID[] of rules the user followed today
 *   rules_broken       — UUID[] of rules the user broke today
 *
 * ENDPOINTS:
 *   GET  /api/sessions?account_id=...&date=YYYY-MM-DD  — fetch a single session
 *   GET  /api/sessions?account_id=...&from=...&to=...  — fetch sessions in range
 *   PUT  /api/sessions                                 — update journal fields
 *   POST /api/sessions                                 — create a session manually
 *                                                        (for days without synced trades)
 *
 * RELATED FILES:
 *   - lib/db.ts — DbSession interface, getSessions()
 *   - /api/sync/route.ts — creates sessions automatically during sync
 *   - 004_journal_system.sql — adds journal columns to sessions table
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, conflict, serverError, ok, notFoundResponse } from "@/lib/api-helpers";

/**
 * GET /api/sessions — fetch sessions with optional filters.
 *
 * Query params:
 *   account_id  — required
 *   date        — fetch a specific day (YYYY-MM-DD)
 *   from        — range start (YYYY-MM-DD)
 *   to          — range end (YYYY-MM-DD)
 *   limit       — max results (default 30)
 */
export async function GET(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const url       = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  const date      = url.searchParams.get("date");
  const from      = url.searchParams.get("from");
  const to        = url.searchParams.get("to");
  const limit     = parseInt(url.searchParams.get("limit") ?? "30", 10);

  if (!accountId) {
    return badRequest("account_id is required");
  }

  // Verify account ownership
  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return notFoundResponse("Account not found");
  }

  // Build query
  let q = supa
    .from("sessions")
    .select("*")
    .eq("account_id", accountId)
    .order("date", { ascending: false })
    .limit(limit);

  // If a specific date is requested, filter to that day
  if (date) {
    q = q.eq("date", date);
  } else {
    // Otherwise, apply optional date range filters
    if (from) q = q.gte("date", from);
    if (to)   q = q.lte("date", to);
  }

  const { data: sessions, error } = await q;

  if (error) {
    return serverError(error.message);
  }

  return ok({ sessions });
}

/**
 * POST /api/sessions — manually create a session for a specific day.
 *
 * Used when the user wants to journal about a day that has no synced trades
 * (e.g., a day they only observed the market, or used a different broker).
 *
 * Expected body: {
 *   account_id: string (required),
 *   date: string (required — YYYY-MM-DD),
 *   ... any journal fields (market_conditions, went_well, etc.)
 * }
 */
export async function POST(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json();

  if (!body.account_id || !body.date) {
    return badRequest("account_id and date are required.");
  }

  // Verify account ownership
  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", body.account_id)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return notFoundResponse("Account not found");
  }

  // Check if a session for this date already exists
  const { data: existing } = await supa
    .from("sessions")
    .select("id")
    .eq("account_id", body.account_id)
    .eq("date", body.date)
    .single();

  if (existing) {
    return conflict("A session for this date already exists. Use PUT to update it.");
  }

  // Create the session with provided journal fields
  const { data: session, error } = await supa
    .from("sessions")
    .insert({
      account_id:        body.account_id,
      date:              body.date,
      total_pnl:         body.total_pnl ?? 0,
      trade_count:       body.trade_count ?? 0,
      notes:             body.notes?.trim() || null,
      market_conditions: body.market_conditions?.trim() || null,
      went_well:         body.went_well?.trim() || null,
      went_poorly:       body.went_poorly?.trim() || null,
      takeaways:         body.takeaways?.trim() || null,
      goals_tomorrow:    body.goals_tomorrow?.trim() || null,
      day_rating:        body.day_rating ?? null,
      mood_morning:      body.mood_morning || null,
      mood_midday:       body.mood_midday || null,
      mood_close:        body.mood_close || null,
      rules_followed:    body.rules_followed ?? [],
      rules_broken:      body.rules_broken ?? [],
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return ok({ session }, 201);
}

/**
 * PUT /api/sessions — update journal fields on an existing session.
 *
 * Expected body: {
 *   id: string (required — session UUID),
 *   ... any journal fields to update
 * }
 *
 * FIELD WHITELIST (only these fields can be updated):
 *   notes, market_conditions, went_well, went_poorly, takeaways,
 *   goals_tomorrow, day_rating, mood_morning, mood_midday, mood_close,
 *   rules_followed, rules_broken
 */
export async function PUT(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json();

  if (!body.id) {
    return badRequest("Session ID is required.");
  }

  // Whitelist of journal fields that can be updated
  const JOURNAL_FIELDS = [
    "notes", "notes_json", "notes_html",        // rich-notes trio
    "market_conditions", "went_well", "went_poorly",
    "takeaways", "goals_tomorrow", "day_rating",
    "mood_morning", "mood_midday", "mood_close",
    "rules_followed", "rules_broken",
  ];

  // Build update object from only allowed fields
  const updates: Record<string, unknown> = {};
  for (const field of JOURNAL_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  // Verify ownership: session → account → user_id
  const { data: session } = await supa
    .from("sessions")
    .select("id, account_id")
    .eq("id", body.id)
    .single();

  if (!session) {
    return notFoundResponse("Session not found.");
  }

  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", session.account_id)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return unauthorized();
  }

  // Perform the update
  const { data: updated, error } = await supa
    .from("sessions")
    .update(updates)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return ok({ session: updated });
}
