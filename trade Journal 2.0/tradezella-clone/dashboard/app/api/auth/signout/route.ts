/**
 * POST /api/auth/signout
 *
 * Signs the user out of both:
 *   1. Supabase Auth — invalidates the session token stored in the auth cookie,
 *      which prevents the middleware from recognising them as authenticated.
 *   2. The MT5 session — deletes the mt5_account httpOnly cookie that stores
 *      the currently active account info.
 *
 * After sign-out, redirects to /login so the user sees the sign-in form.
 *
 * This route is called via a regular HTML <form> POST from the Sidebar and
 * the /accounts page header (not via fetch), so the redirect works naturally.
 * Using a form POST (rather than a client-side fetch) ensures the response
 * redirect is followed by the browser immediately, clearing the UI state.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * POST /api/auth/signout
 * No request body required — the user's identity is read from the session cookie.
 */
export async function POST(req: NextRequest) {
  // Step 1: Sign out from Supabase Auth
  // This invalidates the session on the Supabase server and clears the auth
  // cookies (sb-access-token, sb-refresh-token) from the browser.
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();

  // Step 2: Clear the active MT5 account cookie
  // The middleware doesn't check this cookie, but the overview page reads it
  // to know which account to display. Clearing it prevents stale account data
  // from showing if the user logs back in as a different user.
  const cookieStore = await cookies();
  cookieStore.delete("mt5_account");

  // Step 3: Redirect to /login
  // Use req.nextUrl.origin to build an absolute URL — required for NextResponse.redirect()
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(`${origin}/login`);
}
