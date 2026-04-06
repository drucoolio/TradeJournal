/**
 * lib/api-helpers.ts — Shared utilities for API route handlers.
 *
 * Eliminates repeated auth checks and error responses across all
 * /api/* routes. Every route was duplicating the same 5-line auth
 * block and error formatting — now it's a single function call.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Phase 3 (RLS hardening) — TWO flavors of auth helper:
 * ─────────────────────────────────────────────────────────────────────
 *
 *   apiAuth()       → returns the SSR (anon-key + cookie) Supabase client.
 *                     Reads the user's session from cookies, so auth.uid()
 *                     works inside RLS policies. Every query this client
 *                     issues is filtered by the database's row-level
 *                     security rules. This is the correct helper for
 *                     user-facing routes (/api/trades, /api/rules,
 *                     /api/tags, /api/playbooks, /api/mistakes, etc.)
 *                     because it provides defense-in-depth: even if the
 *                     application code forgets a user_id filter, RLS will
 *                     still refuse to return another user's rows.
 *
 *   apiAuthAdmin()  → returns the service-role Supabase client, which
 *                     BYPASSES RLS. This is required for cross-user or
 *                     bulk-write routes where the process is acting on
 *                     behalf of itself, not the user — e.g. the MT5 sync
 *                     job upserting trades, the cron sync-all route,
 *                     hard deletes that cascade, etc.
 *
 * Both helpers still validate the session (anyone unauthenticated gets
 * null back). The only difference is which database client is returned.
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Return type for apiAuth / apiAuthAdmin.
 *
 * `supa` is typed as a generic SupabaseClient because both the SSR and
 * service-role variants share the same surface area (from/insert/etc.);
 * the only observable difference is whether RLS is enforced.
 */
export interface ApiContext {
  userId: string;
  supa: SupabaseClient;
}

/**
 * Authenticates the current request and returns the user ID + an SSR-aware
 * Supabase client that will enforce row-level security. Returns null if the
 * caller is not authenticated — routes should then return unauthorized().
 *
 * Use this for ANY user-facing route that reads or writes on behalf of the
 * currently logged-in user. RLS will transparently scope every query to
 * rows the user is allowed to see, acting as a safety net if application
 * code ever forgets a user_id filter.
 *
 * Usage:
 *   const ctx = await apiAuth();
 *   if (!ctx) return unauthorized();
 *   const { userId, supa } = ctx;
 *   // `supa` is the SSR client; its queries are RLS-scoped to `userId`.
 */
export async function apiAuth(): Promise<ApiContext | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // IMPORTANT: return the SAME client that did the getUser() call.
  // It already has the cookie-backed session attached, so every subsequent
  // query on it runs as auth.uid() = user.id from the database's perspective.
  return { userId: user.id, supa: supabase };
}

/**
 * Authenticates the request and returns the service-role client. The client
 * bypasses RLS entirely, so this helper is reserved for routes that legitimately
 * need cross-user or admin access — today that's limited to:
 *
 *   - /api/sync              (MT5 sync writes trades in bulk)
 *   - /api/cron/sync-all     (scheduled multi-account sync)
 *   - /api/account/delete    (cascade delete of all related data)
 *   - /api/account/clear-trades (bulk wipe of a user's trade history)
 *   - /api/connect           (initial MT5 handshake; upserts the account row)
 *
 * A user session is still required — this is NOT a back-door for unauthenticated
 * access. It's just a way to say "I am this user, but for this particular job I
 * need RLS to get out of the way so I can do a bulk operation." The caller is
 * responsible for scoping every query by `userId` explicitly.
 *
 * Prefer `apiAuth()` whenever possible. Only reach for this helper after
 * confirming that the route truly cannot run through RLS — usually that means
 * it crosses account/user boundaries or issues writes on behalf of the sync job.
 */
export async function apiAuthAdmin(): Promise<ApiContext | null> {
  // We still validate the session via the SSR client so unauthenticated
  // callers can never reach an admin route. The SERVICE-ROLE client is
  // returned only after the user is confirmed.
  const authCheck = await createSupabaseServer();
  const { data: { user } } = await authCheck.auth.getUser();
  if (!user) return null;
  return { userId: user.id, supa: serverClient() };
}

/** 401 Unauthorized response */
export function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

/** 400 Bad Request response */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 404 Not Found response */
export function notFoundResponse(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** 409 Conflict response (e.g. unique constraint violation) */
export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

/** 500 Internal Server Error response */
export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Standard success response with data */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Handles Supabase errors with appropriate HTTP status codes.
 * Detects unique constraint violations (23505) and returns 409.
 */
export function handleSupabaseError(error: { code?: string; message: string }, entityName = "item") {
  if (error.code === "23505") {
    return conflict(`A ${entityName} with this name already exists.`);
  }
  return serverError(error.message);
}
