/**
 * app/api/profile/route.ts — Handles reading and updating user profile data.
 *
 * Profile data is stored in Supabase Auth's user_metadata, which is a JSONB
 * column on the auth.users table. This avoids creating a separate profiles
 * table while still supporting arbitrary user-editable fields.
 *
 * Stored fields (in user_metadata):
 *   - first_name: string
 *   - last_name: string
 *   - username: string
 *
 * Email lives on the auth.users row directly (not in metadata), so updating
 * email uses a different Supabase method (supabase.auth.updateUser({ email })).
 *
 * SECURITY:
 *   - GET: Uses the SSR cookie-based client to read the current user's data.
 *     Only returns the authenticated user's own profile.
 *   - PUT: Updates user_metadata via the admin API (service-role client) so
 *     we can set metadata without triggering email re-verification. The
 *     handler still validates the user's session first.
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";

/**
 * GET /api/profile — Returns the current user's profile data.
 *
 * Response shape:
 *   { email, first_name, last_name, username }
 */
export async function GET() {
  // Get the authenticated user from the SSR cookie-based client
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Extract profile fields from user_metadata (may be undefined if never set)
  const meta = user.user_metadata ?? {};

  return NextResponse.json({
    email: user.email ?? "",
    first_name: meta.first_name ?? "",
    last_name: meta.last_name ?? "",
    username: meta.username ?? "",
  });
}

/**
 * PUT /api/profile — Updates the current user's profile data.
 *
 * Expected body:
 *   { first_name?: string, last_name?: string, username?: string, email?: string }
 *
 * Only provided fields are updated. Missing fields are left unchanged.
 */
export async function PUT(req: Request) {
  // Verify the user is authenticated before making any changes
  const supabase = await createSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { first_name, last_name, username, email } = body;

  // Build the metadata update payload — only include fields that were sent
  const metadataUpdate: Record<string, string> = {};
  if (first_name !== undefined) metadataUpdate.first_name = first_name;
  if (last_name !== undefined) metadataUpdate.last_name = last_name;
  if (username !== undefined) metadataUpdate.username = username;

  // Use the service-role client (admin) to update user_metadata.
  // This bypasses RLS and doesn't trigger email re-verification for metadata changes.
  const admin = serverClient();

  // Update user_metadata if any metadata fields were provided
  if (Object.keys(metadataUpdate).length > 0) {
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, ...metadataUpdate },
    });

    if (metaError) {
      console.error("[profile] Failed to update user_metadata:", metaError.message);
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }
  }

  // Update email separately if it changed (Supabase handles verification)
  if (email !== undefined && email !== user.email) {
    const { error: emailError } = await admin.auth.admin.updateUserById(user.id, {
      email,
    });

    if (emailError) {
      console.error("[profile] Failed to update email:", emailError.message);
      return NextResponse.json({ error: emailError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
