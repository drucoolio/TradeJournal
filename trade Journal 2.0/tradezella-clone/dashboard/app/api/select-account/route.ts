/**
 * POST /api/select-account
 *
 * Activates an already-linked MT5 account when the user clicks an account
 * card on the /accounts page. Unlike /api/connect (which registers a NEW
 * account), this route reuses the stored credentials to reconnect the VPS.
 *
 * FLOW:
 *   1. Verify user is authenticated (Supabase session cookie)
 *   2. Extract the MT5 login number from the request body
 *   3. Fetch stored credentials from mt5_credentials (service role, gets password)
 *   4. Call VPS /connect with those credentials to authenticate with MT5
 *   5. Update the account's balance/equity in the DB with fresh values
 *   6. Set the mt5_account session cookie (so subsequent page loads work)
 *   7. Return the account info to AccountCard.tsx which then redirects to /overview
 *
 * WHY WE RECONNECT TO VPS ON EVERY SELECT:
 *   The VPS holds only ONE active MT5 session at a time (the MetaTrader5 Python
 *   library is single-account). Selecting a different account needs to call
 *   /connect on the VPS so it switches to that account's context. Subsequent
 *   calls to /account, /history, /trades will use the newly selected account.
 *
 * ERROR CASES:
 *   - Not authenticated → 401
 *   - Missing login → 400
 *   - Account not found in mt5_credentials → 404
 *   - VPS connection timeout → 504
 *   - Other VPS errors → 500
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";
import { vpsConnect } from "@/lib/vps";
import { cookies } from "next/headers";
import type { BrokerAccount } from "@/lib/broker";

/**
 * POST /api/select-account
 *
 * Expected request body (JSON):
 *   { login: number }  — the MT5 account number to activate
 */
export async function POST(req: NextRequest) {
  // Step 1: Verify authentication — only the account owner can select their accounts
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Step 2: Extract login from request body
  const { login } = await req.json() as { login: number };
  if (!login) {
    return NextResponse.json({ error: "login is required" }, { status: 400 });
  }

  // Step 3: Fetch the stored credentials for this account
  // We need the stored password to reconnect the VPS.
  // Service role bypasses RLS — we verify user_id = user.id in the .eq() clause
  // so users can only fetch their own credentials.
  const supa = serverClient();
  const { data: cred, error: credError } = await supa
    .from("mt5_credentials")
    .select("login, password, server, label")
    .eq("user_id", user.id) // ensures the credential belongs to this user
    .eq("login", login)     // find the specific account
    .single();              // expect exactly one row (UNIQUE constraint on user_id+login)

  if (credError || !cred) {
    // Account not found in the credentials table — should not happen for linked accounts
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Step 4: Reconnect the VPS to this MT5 account
  // This switches the VPS's active MT5 session to the requested account.
  try {
    const result = await vpsConnect(
      cred.login,    // MT5 account number
      cred.password, // investor password retrieved from DB
      cred.server,   // broker server name
    );
    const info = result.account; // fresh account info from MT5

    // Map VPS AccountInfo → unified BrokerAccount type for the session cookie
    const account: BrokerAccount = {
      broker:      "mt5",
      login:       info.login,       // MT5 account number (numeric, stored as string)
      name:        info.name,
      server:      info.server,
      currency:    info.currency,
      balance:     info.balance,
      equity:      info.equity,
      margin:      info.margin,
      margin_free: info.margin_free,
      leverage:    info.leverage,
    };

    // Step 5: Update the stored account balance/equity with the fresh values from VPS
    // This keeps the /accounts picker showing current balances without a full sync.
    await supa
      .from("accounts")
      .update({ balance: info.balance, equity: info.equity })
      .eq("login", login)      // identify the row by MT5 login
      .eq("user_id", user.id); // extra safety: only update if it's this user's account

    // Step 6: Set the active account cookie
    // httpOnly: true → JavaScript cannot read this cookie (protects against XSS)
    // secure in production → only sent over HTTPS
    // maxAge 8 hours → session expires after a working day (user must re-select)
    const cookieStore = await cookies();
    cookieStore.set("mt5_account", JSON.stringify(account), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production", // HTTPS only in production
      maxAge:   8 * 60 * 60, // 8 hours in seconds
      path:     "/",
    });

    // Step 7: Return success — AccountCard.tsx will redirect to /overview
    return NextResponse.json({ ok: true, account });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[select-account]", msg);

    // Distinguish timeout/network errors from credential errors for the UI
    if (msg.includes("ECONNRESET") || msg.includes("aborted")) {
      return NextResponse.json(
        { error: "VPS connection timed out. Is MT5 running on the VPS?" },
        { status: 504 }, // 504 Gateway Timeout
      );
    }
    // All other errors (wrong password, server unreachable) → 500
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
