/**
 * app/api/account/clear-trades/route.ts — Deletes all trades for an account.
 *
 * DESTRUCTIVE ACTION: Permanently removes all trade rows AND session summaries
 * for the specified account. The account itself (credentials, balance, etc.)
 * is preserved — only the trade history is wiped.
 *
 * Tables affected:
 *   - trades: all rows where account_id matches (DELETE)
 *   - sessions: all rows where account_id matches (DELETE)
 *
 * SECURITY:
 *   - Requires authenticated session (SSR cookie-based client)
 *   - Verifies the account belongs to the current user before deleting
 *   - Uses service-role client for the actual deletes (bypasses RLS)
 *
 * REQUEST BODY:
 *   { accountId: string }  — the accounts.id (UUID) to clear trades from
 *
 * RESPONSE:
 *   200 { success: true, deletedTrades: number }
 *   401 { error: "Not authenticated" }
 *   403 { error: "Account not found or not yours" }
 *   500 { error: string }
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";

export async function DELETE(req: Request) {
  // Verify the user is authenticated
  const supabase = await createSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { accountId } = await req.json();
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const db = serverClient();

  // Verify the account belongs to the current user before deleting anything.
  // This prevents a malicious request from clearing trades on another user's account.
  const { data: account, error: accError } = await db
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (accError || !account) {
    return NextResponse.json({ error: "Account not found or not yours" }, { status: 403 });
  }

  // Delete all session summaries for this account (computed daily P&L snapshots)
  const { error: sessError } = await db
    .from("sessions")
    .delete()
    .eq("account_id", accountId);

  if (sessError) {
    console.error("[clear-trades] Failed to delete sessions:", sessError.message);
    return NextResponse.json({ error: sessError.message }, { status: 500 });
  }

  // Delete all trades for this account
  // We first count them so we can report how many were deleted
  const { count } = await db
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);

  const { error: tradeError } = await db
    .from("trades")
    .delete()
    .eq("account_id", accountId);

  if (tradeError) {
    console.error("[clear-trades] Failed to delete trades:", tradeError.message);
    return NextResponse.json({ error: tradeError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deletedTrades: count ?? 0 });
}
