/**
 * lib/auth.ts — Shared authentication helpers.
 *
 * Centralizes the auth-check pattern that was previously duplicated
 * in every Server Component page. Call requireAuth() at the top of
 * any page that needs a logged-in user.
 */

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * Verifies the user is authenticated via Supabase session cookie.
 * Redirects to /login if no valid session exists.
 *
 * Usage in any Server Component:
 *   const user = await requireAuth();
 *   // user is guaranteed to be non-null here
 */
export async function requireAuth(): Promise<User> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}
