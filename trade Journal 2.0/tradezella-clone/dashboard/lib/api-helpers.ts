/**
 * lib/api-helpers.ts — Shared utilities for API route handlers.
 *
 * Eliminates repeated auth checks and error responses across all
 * /api/* routes. Every route was duplicating the same 5-line auth
 * block and error formatting — now it's a single function call.
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Return type for apiAuth() — authenticated user + service client */
export interface ApiContext {
  userId: string;
  supa: SupabaseClient;
}

/**
 * Authenticates the current request and returns the user ID + service client.
 * Returns null if not authenticated — caller should return the 401 response.
 *
 * Usage:
 *   const ctx = await apiAuth();
 *   if (!ctx) return unauthorized();
 *   const { userId, supa } = ctx;
 */
export async function apiAuth(): Promise<ApiContext | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
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
