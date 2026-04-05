/**
 * POST /api/security/change-password
 *
 * Changes the authenticated user's password.
 *
 * FLOW:
 *   1. Verify the user is authenticated (Supabase session cookie)
 *   2. Validate the request body (currentPassword, newPassword)
 *   3. Verify the current password by attempting a sign-in with Supabase
 *   4. Update the password using the admin client (service role)
 *   5. Return success
 *
 * SECURITY:
 *   - Requires the current password to prevent unauthorized changes
 *     (e.g. if someone gains access to an active session)
 *   - Uses signInWithPassword to verify the current password — this is
 *     Supabase's recommended approach instead of comparing hashes directly
 *   - The admin client (service role) is used for the actual update because
 *     updateUser via the anon client requires the user to be freshly
 *     authenticated, which can fail with stale sessions
 *   - Minimum 8 character requirement enforced server-side (in addition
 *     to client-side validation in PasswordForm.tsx)
 *
 * ERROR CASES:
 *   - Not authenticated → 401
 *   - Missing fields → 400
 *   - Current password wrong → 403
 *   - New password too short → 400
 *   - Supabase error → 500
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase";

// Service role client for admin password update (bypasses RLS)
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  // Step 1: Verify the user is logged in
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Step 2: Parse and validate request body
  const { currentPassword, newPassword } = await req.json() as {
    currentPassword: string;
    newPassword: string;
  };

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required." },
      { status: 400 },
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 },
    );
  }

  // Step 3: Verify the current password by attempting a sign-in.
  // We create a fresh anon client (not the SSR client) because signInWithPassword
  // needs a clean context — it would overwrite the existing session otherwise.
  const verifyClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false }, // don't store this temporary session
  });

  const { error: signInError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    // signInError.message is usually "Invalid login credentials"
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 403 },
    );
  }

  // Step 4: Update the password using the admin client (service role).
  // This bypasses any session freshness requirements.
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );

  if (updateError) {
    console.error("[change-password]", updateError.message);
    return NextResponse.json(
      { error: "Failed to update password. Please try again." },
      { status: 500 },
    );
  }

  // Step 5: Success
  return NextResponse.json({ success: true });
}
