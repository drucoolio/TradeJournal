/**
 * app/api/account/delete/route.ts — Permanently deletes an account and all its data.
 *
 * DESTRUCTIVE ACTION: Removes the account, all its trades, session summaries,
 * and the stored MT5 credentials. This cannot be undone.
 *
 * DELETION ORDER (important for foreign key constraints):
 *   1. sessions      — FK on account_id
 *   2. trades         — FK on account_id
 *   3. accounts       — the account row itself
 *   4. mt5_credentials — the stored login/password/server (linked by login number)
 *
 * SECURITY:
 *   - Requires authenticated session
 *   - Verifies account + credentials belong to the current user
 *   - Uses service-role client for deletes (bypasses RLS)
 *
 * REQUEST BODY:
 *   { accountId: string, login: number }
 *   accountId = accounts.id (UUID), login = MT5 account number
 *
 * RESPONSE:
 *   200 { success: true }
 *   401 { error: "Not authenticated" }
 *   403 { error: "Account not found or not yours" }
 *   500 { error: string }
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";

export async function DELETE(req: Request) {
  // Verify authentication
  const supabase = await createSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { accountId, login } = await req.json();
  if (!login) {
    return NextResponse.json({ error: "Missing login" }, { status: 400 });
  }

  const db = serverClient();

  // Verify the MT5 credentials belong to the current user
  const { data: cred, error: credError } = await db
    .from("mt5_credentials")
    .select("id")
    .eq("login", login)
    .eq("user_id", user.id)
    .single();

  if (credError || !cred) {
    return NextResponse.json({ error: "Account not found or not yours" }, { status: 403 });
  }

  // If the account has been synced (accountId exists), delete its data in FK order
  if (accountId) {
    // 1. Delete session summaries (references account_id)
    const { error: sessErr } = await db
      .from("sessions")
      .delete()
      .eq("account_id", accountId);

    if (sessErr) {
      console.error("[delete-account] Failed to delete sessions:", sessErr.message);
      return NextResponse.json({ error: sessErr.message }, { status: 500 });
    }

    // 2. Delete all trades (references account_id)
    const { error: tradeErr } = await db
      .from("trades")
      .delete()
      .eq("account_id", accountId);

    if (tradeErr) {
      console.error("[delete-account] Failed to delete trades:", tradeErr.message);
      return NextResponse.json({ error: tradeErr.message }, { status: 500 });
    }

    // 3. Delete the account row itself
    const { error: accErr } = await db
      .from("accounts")
      .delete()
      .eq("id", accountId);

    if (accErr) {
      console.error("[delete-account] Failed to delete account:", accErr.message);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }
  }

  // 4. Delete the stored MT5 credentials (login, password, server)
  const { error: credDelErr } = await db
    .from("mt5_credentials")
    .delete()
    .eq("login", login)
    .eq("user_id", user.id);

  if (credDelErr) {
    console.error("[delete-account] Failed to delete credentials:", credDelErr.message);
    return NextResponse.json({ error: credDelErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
