/**
 * /api/weekly-reviews — CRUD API for Weekly Review Journals.
 *
 * Weekly reviews are the highest-level journaling tool. At the end of each
 * trading week, the user reflects on the entire week's performance, identifies
 * patterns, evaluates whether their weekly goals were met, and sets goals
 * for the coming week.
 *
 * WEEKLY REVIEW FIELDS (from 004_journal_system.sql):
 *   week_start           — date (Monday of the reviewed week)
 *   week_end             — date (Sunday of the reviewed week)
 *   goals_met            — jsonb array of { goal: string, met: boolean }
 *   top_lessons          — key insights from the week
 *   patterns             — behavioral/market patterns noticed
 *   strategy_adjustments — changes to strategy going forward
 *   goals_next_week      — specific goals for next week
 *   confidence           — 1-5 confidence going into next week
 *   week_rating          — 1-5 overall rating for the week
 *
 * ENDPOINTS:
 *   GET    /api/weekly-reviews  — list reviews (supports date filtering)
 *   POST   /api/weekly-reviews  — create a new weekly review
 *   PUT    /api/weekly-reviews  — update an existing weekly review
 *   DELETE /api/weekly-reviews  — delete a weekly review
 *
 * UNIQUENESS CONSTRAINT:
 *   Each (user_id, account_id, week_start) tuple is unique — one review
 *   per week per account. Use account_id = null for cross-account reviews.
 *
 * RELATED FILES:
 *   - components/journal/WeeklyReview.tsx — client UI component
 *   - 004_journal_system.sql — creates weekly_reviews table
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, conflict, serverError, ok, notFoundResponse, handleSupabaseError } from "@/lib/api-helpers";

/**
 * GET /api/weekly-reviews — fetch weekly reviews with optional filters.
 *
 * Query params:
 *   account_id  — filter to a specific account (optional; omit for all)
 *   week_start  — fetch a specific week (YYYY-MM-DD, must be a Monday)
 *   from        — range start
 *   to          — range end
 *   limit       — max results (default 10)
 */
export async function GET(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const url        = new URL(req.url);
  const accountId  = url.searchParams.get("account_id");
  const weekStart  = url.searchParams.get("week_start");
  const from       = url.searchParams.get("from");
  const to         = url.searchParams.get("to");
  const limit      = parseInt(url.searchParams.get("limit") ?? "10", 10);

  let q = supa
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limit);

  // Apply optional filters
  if (accountId)  q = q.eq("account_id", accountId);
  if (weekStart)  q = q.eq("week_start", weekStart);
  if (from)       q = q.gte("week_start", from);
  if (to)         q = q.lte("week_start", to);

  const { data: reviews, error } = await q;

  if (error) {
    return serverError(error.message);
  }

  return ok({ reviews });
}

/**
 * POST /api/weekly-reviews — create a new weekly review.
 *
 * Expected body: {
 *   week_start: string (YYYY-MM-DD, must be a Monday),
 *   week_end: string (YYYY-MM-DD, must be a Sunday),
 *   account_id?: string (optional — null for cross-account),
 *   goals_met?: { goal: string, met: boolean }[],
 *   top_lessons?: string,
 *   patterns?: string,
 *   strategy_adjustments?: string,
 *   goals_next_week?: string,
 *   confidence?: number (1-5),
 *   week_rating?: number (1-5),
 * }
 */
export async function POST(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json();

  // Validate required fields
  if (!body.week_start || !body.week_end) {
    return badRequest("week_start and week_end are required.");
  }

  // Validate week_start is a Monday (day 1 in JS getDay())
  const startDay = new Date(body.week_start + "T12:00:00").getDay();
  if (startDay !== 1) {
    return badRequest("week_start must be a Monday.");
  }

  // If account_id is provided, verify ownership
  if (body.account_id) {
    const { data: account } = await supa
      .from("accounts")
      .select("id")
      .eq("id", body.account_id)
      .eq("user_id", userId)
      .single();

    if (!account) {
      return notFoundResponse("Account not found");
    }
  }

  const { data: review, error } = await supa
    .from("weekly_reviews")
    .insert({
      user_id:              userId,
      account_id:           body.account_id || null,
      week_start:           body.week_start,
      week_end:             body.week_end,
      goals_met:            body.goals_met ?? null,
      top_lessons:          body.top_lessons?.trim() || null,
      patterns:             body.patterns?.trim() || null,
      strategy_adjustments: body.strategy_adjustments?.trim() || null,
      goals_next_week:      body.goals_next_week?.trim() || null,
      confidence:           body.confidence ?? null,
      week_rating:          body.week_rating ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return handleSupabaseError(error, "weekly review");
  }

  return ok({ review }, 201);
}

/**
 * PUT /api/weekly-reviews — update an existing weekly review.
 *
 * Expected body: { id: string, ...fields to update }
 */
export async function PUT(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json();

  if (!body.id) {
    return badRequest("Review ID is required.");
  }

  // Whitelist of updatable fields
  const FIELDS = [
    "goals_met", "top_lessons", "patterns", "strategy_adjustments",
    "goals_next_week", "confidence", "week_rating",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  // Verify ownership
  const { data: review } = await supa
    .from("weekly_reviews")
    .select("id")
    .eq("id", body.id)
    .eq("user_id", userId)
    .single();

  if (!review) {
    return notFoundResponse("Review not found.");
  }

  const { data: updated, error } = await supa
    .from("weekly_reviews")
    .update(updates)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return ok({ review: updated });
}

/**
 * DELETE /api/weekly-reviews — delete a weekly review.
 *
 * Expected body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = await req.json() as { id: string };
  if (!id) {
    return badRequest("Review ID is required.");
  }

  const { error } = await supa
    .from("weekly_reviews")
    .delete()
    .eq("id", id)
    .eq("user_id", userId); // ownership check

  if (error) {
    return serverError(error.message);
  }

  return ok({ success: true });
}
