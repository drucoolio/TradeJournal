/**
 * POST /api/connect
 *
 * Handles connecting a new MT5 account to the user's profile.
 * Called by the /connect page form after the user enters their broker credentials.
 *
 * FLOW:
 *   1. Verify user is logged in (Supabase Auth session via cookie)
 *   2. Validate and parse the request body
 *   3. Call the VPS /connect endpoint to verify credentials with MT5
 *   4. Save credentials to mt5_credentials table (linked to user_id)
 *   5. Upsert the account row into accounts table (with user_id set)
 *   6. Set the mt5_account session cookie (so user lands on dashboard)
 *   7. Return the connected account info
 *
 * SECURITY:
 *   - Only authenticated users can add accounts (step 1 guard)
 *   - Investor (read-only) password is stored, NOT the master password
 *   - Credentials are stored via service role (RLS bypassed server-side)
 *     but the RLS policy ensures users can only READ their own credentials
 *   - The mt5_account cookie is httpOnly (JS can't access it)
 *
 * ERROR CASES:
 *   - Not authenticated → 401
 *   - Missing fields → 400
 *   - VPS timeout → 504 (MT5 server took too long to respond)
 *   - Wrong credentials → 401 (VPS returns error, we forward the message)
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, serverClient } from "@/lib/supabase";
import { getAdapter } from "@/lib/adapters";
import type { BrokerCredentials, BrokerType } from "@/lib/broker";

/**
 * POST /api/connect handler.
 *
 * Expected request body (JSON):
 *   broker: "mt5" | "ctrader"
 *   login: number          (MT5 account number)
 *   password: string       (investor/read-only password)
 *   server: string         (broker server name)
 *   label?: string         (optional user-defined nickname)
 */
export async function POST(req: NextRequest) {
  // Step 1: Verify the user is logged in via Supabase Auth session cookie
  // createSupabaseServer() reads the session from the request cookies
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // No valid session cookie = not authenticated
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Parse request body — wrap in try/catch in case Content-Type is wrong
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate broker field — only "mt5" and "ctrader" are recognised broker IDs
  const broker = body.broker as BrokerType | undefined;
  if (!broker || !["mt5", "ctrader"].includes(broker)) {
    return NextResponse.json(
      { error: "broker must be 'mt5' or 'ctrader'." },
      { status: 400 },
    );
  }

  // Step 2: Build typed credentials based on broker type
  let credentials: BrokerCredentials;
  if (broker === "mt5") {
    const { login, password, server } = body;
    if (!login || !password || !server) {
      return NextResponse.json(
        { error: "MT5 requires login, password, and server." },
        { status: 400 },
      );
    }
    credentials = {
      broker:   "mt5",
      login:    Number(login),    // convert from JSON (could be string or number)
      password: String(password), // investor password — read-only access to MT5
      server:   String(server),   // must match exactly e.g. "FundedNext-Server 2"
    };
  } else {
    // cTrader support is planned but not yet implemented
    return NextResponse.json(
      { error: "cTrader support is coming soon." },
      { status: 501 },
    );
  }

  try {
    // Step 3: Connect to VPS and verify credentials
    // getAdapter returns the mt5Adapter which calls vpsConnect() internally
    const adapter = getAdapter(broker);
    const account = await adapter.connect(credentials); // throws if credentials are wrong

    // Use service-role client for DB writes (bypasses RLS)
    const supa = serverClient();

    // Step 4: Save credentials to mt5_credentials table
    // We upsert so that re-connecting the same account updates the stored password
    // (useful if the user generates a new investor password).
    // UNIQUE constraint is (user_id, login) — so one entry per user per account.
    const { error: credError } = await supa
      .from("mt5_credentials")
      .upsert(
        {
          user_id:  user.id,            // links credentials to this Supabase Auth user
          login:    credentials.login,  // MT5 account number
          password: credentials.password, // investor password — stored server-side only
          server:   credentials.server,
          label:    String(body.label ?? ""), // user-defined display name (can be empty)
        },
        { onConflict: "user_id,login" }, // update if this user already has this account
      );

    if (credError) {
      // Non-fatal: VPS connect succeeded, so we continue even if credential save fails.
      // The user will still be able to use the dashboard, but the account won't appear
      // on the /accounts picker until the credentials are saved successfully.
      console.error("[connect] credentials upsert:", credError.message);
    }

    // Step 5: Upsert the account row
    // The accounts table stores public info (balance, currency) — no passwords.
    // user_id is set here so getAccountsByUserId() will find this account later.
    const { error: accError } = await supa
      .from("accounts")
      .upsert(
        {
          user_id:  user.id,        // links account to the logged-in user
          login:    account.login,  // MT5 account number (unique conflict key)
          name:     account.name,   // account owner name from MT5
          broker:   account.server, // server name stored in the "broker" column
          currency: account.currency,
          balance:  account.balance,
          equity:   account.equity,
          leverage: account.leverage,
        },
        { onConflict: "login" }, // update if account row already exists
      );

    if (accError) {
      console.error("[connect] account upsert:", accError.message);
    }

    // Step 6: Set the active account in an httpOnly session cookie
    // This cookie tells the dashboard which account is currently selected.
    // httpOnly: JS cannot read this cookie (XSS protection)
    // maxAge 8 hours: user stays logged in for a working day
    const cookieStore = await cookies();
    cookieStore.set("mt5_account", JSON.stringify(account), {
      httpOnly: true,
      sameSite: "lax",   // allows the cookie to be sent on same-site navigations
      maxAge:   60 * 60 * 8, // 8 hours in seconds
      path:     "/",
    });

    // Step 7: Return account info to the connect page
    // The page will redirect to /accounts on receipt of this response
    return NextResponse.json({ status: "connected", account });

  } catch (err) {
    // Distinguish timeout from other errors to give the user a clearer message
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" ||                         // fetch AbortController fired
        (err as NodeJS.ErrnoException).code === "ECONNRESET"); // socket closed mid-request

    if (isTimeout) {
      return NextResponse.json(
        { error: "Connection timed out. Check the server name is correct and the VPS can reach the broker." },
        { status: 504 }, // 504 Gateway Timeout
      );
    }

    // All other errors (wrong password, server not found) → 401 Unauthorized
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
