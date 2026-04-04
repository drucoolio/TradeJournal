/**
 * GET /api/cron/sync-all
 *
 * Automated hourly sync for ALL linked MT5 accounts across all users.
 * Designed to be called by an external cron scheduler (Vercel Cron, crontab,
 * or any HTTP-based scheduler) every hour.
 *
 * FLOW:
 *   1. Verify the request using CRON_SECRET header (prevents unauthorized triggers)
 *   2. Fetch all MT5 credentials from all users
 *   3. For each account (sequentially, one at a time):
 *      a. Skip if last_synced_at was within the last 15 minutes (rate limit)
 *      b. Acquire the VPS mutex
 *      c. Connect VPS to this account
 *      d. Fetch /account and /history from VPS
 *      e. Normalize deals and upsert to Supabase
 *      f. Rebuild daily sessions
 *      g. Update last_synced_at
 *   4. Return a summary of what was synced
 *
 * SEQUENTIAL PROCESSING:
 *   Accounts are synced one at a time because the VPS can only hold one active
 *   MT5 session. The mutex ensures safety, but sequential processing also means
 *   we don't queue up a huge backlog of waiting syncs.
 *
 * RATE LIMIT RESPECT:
 *   If a user manually synced an account 5 minutes ago, the cron skips it.
 *   This prevents unnecessary duplicate work and VPS load.
 *
 * SECURITY:
 *   Protected by CRON_SECRET env var. The request must include either:
 *   - Header: Authorization: Bearer <CRON_SECRET>
 *   - Or for Vercel Cron: the x-vercel-cron-signature header (auto-added)
 *
 * SETUP:
 *   Option A — Vercel Cron (vercel.json):
 *     { "crons": [{ "path": "/api/cron/sync-all", "schedule": "0 * * * *" }] }
 *
 *   Option B — External crontab on VPS:
 *     0 * * * * curl -H "Authorization: Bearer YOUR_SECRET" https://yourapp.com/api/cron/sync-all
 *
 *   Option C — Simple setInterval in a separate Node process for development.
 */

import { NextRequest, NextResponse } from "next/server";
import { vpsConnect, vpsAccount, vpsHistory } from "@/lib/vps";
import { serverClient } from "@/lib/supabase";
import { normalizeDeals, tradeRowToSupabase } from "@/lib/normalizer";
import { withSyncMutex } from "@/lib/sync-mutex";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum seconds since last sync before the cron will re-sync an account. */
const MIN_SYNC_GAP_SECONDS = 15 * 60; // 15 minutes — matches the manual rate limit

/** Secret token to authenticate cron requests. Set in .env as CRON_SECRET. */
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

/**
 * Validates that the request is from an authorized cron trigger.
 *
 * Supports two auth methods:
 *   1. Vercel Cron — automatically sends CRON_SECRET in the Authorization header
 *      when the cron is defined in vercel.json. No extra config needed on Vercel.
 *   2. External caller — must send "Authorization: Bearer <CRON_SECRET>" header.
 *
 * In development (CRON_SECRET not set), the endpoint is open so you can test
 * with `curl http://localhost:3000/api/cron/sync-all`. In production, you MUST
 * set CRON_SECRET in your Vercel environment variables.
 */
function isAuthorized(req: NextRequest): boolean {
  // If no secret is configured, allow all requests (dev mode only)
  if (!CRON_SECRET) {
    console.warn("[cron/sync-all] CRON_SECRET not set — endpoint is unprotected!");
    return true;
  }

  // Check Authorization: Bearer <token> header (Vercel Cron + external callers)
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  return token === CRON_SECRET;
}

// ---------------------------------------------------------------------------
// Per-account sync logic (reused from /api/sync, but takes explicit credentials)
// ---------------------------------------------------------------------------

/** Result of syncing a single account. */
interface SyncResult {
  login: number;
  status: "synced" | "skipped" | "error";
  synced?: number;   // number of trades upserted
  days?: number;     // number of session days rebuilt
  reason?: string;   // why it was skipped or the error message
}

/**
 * Syncs a single MT5 account: connect → fetch → normalize → upsert.
 * Runs inside the VPS mutex to prevent concurrent session switching.
 *
 * @param cred — MT5 login, password, server from mt5_credentials table
 * @returns SyncResult with status and trade count
 */
async function syncOneAccount(cred: {
  login: number;
  password: string;
  server: string;
}): Promise<SyncResult> {
  const supa = serverClient();

  // Check rate limit: skip if this account was synced recently
  const { data: acc } = await supa
    .from("accounts")
    .select("last_synced_at")
    .eq("login", cred.login)
    .single();

  if (acc?.last_synced_at) {
    const elapsed = (Date.now() - new Date(acc.last_synced_at).getTime()) / 1000;
    if (elapsed < MIN_SYNC_GAP_SECONDS) {
      const mins = Math.ceil((MIN_SYNC_GAP_SECONDS - elapsed) / 60);
      return {
        login: cred.login,
        status: "skipped",
        reason: `Synced ${Math.floor(elapsed / 60)}m ago, next sync in ${mins}m`,
      };
    }
  }

  // Run inside mutex — ensures exclusive VPS access for connect → history
  try {
    const result = await withSyncMutex(async () => {
      // Step 1: Connect VPS to this account
      await vpsConnect(cred.login, cred.password, cred.server);

      // Step 2: Fetch fresh account info
      const accountInfo = await vpsAccount();

      // Step 3: Upsert account row with fresh balance + last_synced_at
      const { data: accRow, error: accErr } = await supa
        .from("accounts")
        .upsert(
          {
            login:          accountInfo.login,
            name:           accountInfo.name,
            broker:         accountInfo.server,
            currency:       accountInfo.currency,
            balance:        accountInfo.balance,
            equity:         accountInfo.equity,
            leverage:       accountInfo.leverage,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "login" },
        )
        .select("id")
        .single();

      if (accErr) throw new Error(`accounts upsert: ${accErr.message}`);
      const accountId = accRow.id as string;

      // Step 4: Fetch full deal history
      const historyResp = await vpsHistory();

      // Step 5: Normalize and upsert trades in batches
      const rows = normalizeDeals(historyResp.deals);
      const BATCH = 500;
      let synced = 0;

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
          .map((r) => tradeRowToSupabase(r, accountId));

        const { error } = await supa
          .from("trades")
          .upsert(batch as Parameters<typeof supa.from>[0] extends never ? never : never[], {
            onConflict:       "account_id,position_id",
            ignoreDuplicates: false,
          });

        if (error) throw new Error(`trades upsert batch: ${error.message}`);
        synced += batch.length;
      }

      // Step 6: Rebuild daily session summaries
      const { data: trades } = await supa
        .from("trades")
        .select("close_time, net_pnl")
        .eq("account_id", accountId);

      const byDate = new Map<string, { total_pnl: number; trade_count: number }>();
      for (const t of trades ?? []) {
        if (!t.close_time) continue;
        const date = (t.close_time as string).slice(0, 10);
        const prev = byDate.get(date) ?? { total_pnl: 0, trade_count: 0 };
        byDate.set(date, {
          total_pnl:   prev.total_pnl + (t.net_pnl ?? 0),
          trade_count: prev.trade_count + 1,
        });
      }

      if (byDate.size > 0) {
        const sessionRows = Array.from(byDate.entries()).map(([date, agg]) => ({
          account_id: accountId,
          date,
          total_pnl:   agg.total_pnl,
          trade_count: agg.trade_count,
        }));

        await supa
          .from("sessions")
          .upsert(sessionRows, { onConflict: "account_id,date" });
      }

      return { synced, days: byDate.size };
    });

    return {
      login:  cred.login,
      status: "synced",
      synced: result.synced,
      days:   result.days,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/sync-all] Account ${cred.login} failed:`, message);
    return {
      login:  cred.login,
      status: "error",
      reason: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/cron/sync-all
 *
 * Iterates through ALL linked MT5 accounts and syncs each one sequentially.
 * Protected by CRON_SECRET. Returns a summary of results per account.
 */
export async function GET(req: NextRequest) {
  // Step 1: Auth check
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log("[cron/sync-all] Starting automated sync for all accounts...");

  try {
    const supa = serverClient();

    // Step 2: Fetch ALL MT5 credentials across all users
    // Service role bypasses RLS so we can see every user's credentials
    const { data: allCreds, error: credError } = await supa
      .from("mt5_credentials")
      .select("login, password, server")
      .order("created_at", { ascending: true });

    if (credError) {
      throw new Error(`Failed to fetch credentials: ${credError.message}`);
    }

    if (!allCreds || allCreds.length === 0) {
      return NextResponse.json({
        message: "No accounts to sync",
        results: [],
        durationMs: Date.now() - startTime,
      });
    }

    console.log(`[cron/sync-all] Found ${allCreds.length} account(s) to process`);

    // Step 3: Sync each account sequentially (one at a time because of VPS limit)
    const results: SyncResult[] = [];
    for (const cred of allCreds) {
      console.log(`[cron/sync-all] Processing account ${cred.login}...`);
      const result = await syncOneAccount(cred);
      results.push(result);
      console.log(`[cron/sync-all] Account ${cred.login}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    }

    // Step 4: Build summary
    const synced  = results.filter(r => r.status === "synced").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors  = results.filter(r => r.status === "error").length;
    const durationMs = Date.now() - startTime;

    console.log(`[cron/sync-all] Done in ${durationMs}ms — synced: ${synced}, skipped: ${skipped}, errors: ${errors}`);

    return NextResponse.json({
      message: `Processed ${allCreds.length} account(s)`,
      summary: { synced, skipped, errors },
      results,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-all] Fatal error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
