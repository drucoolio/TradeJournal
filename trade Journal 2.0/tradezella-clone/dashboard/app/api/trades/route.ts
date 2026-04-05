/**
 * /api/trades — Manual Trade Entry + Trade Journal API.
 *
 * This API serves two purposes:
 *
 *   1. MANUAL TRADE ENTRY (POST):
 *      Allows users to add trades that weren't captured by MT5 sync.
 *      Manual trades use negative position_ids (from manual_trade_position_seq)
 *      to avoid collision with MT5's large positive position numbers.
 *      Manual trades are flagged with source = 'manual'.
 *
 *   2. TRADE JOURNAL UPDATES (PUT):
 *      Allows users to update journal fields on any trade (synced or manual).
 *      Journal fields include: notes, tags, setup_type, mood_entry/exit,
 *      trade_thesis, execution_rating, setup_rating, went_right/wrong,
 *      lessons, playbook_id, mistake_ids, confidence, etc.
 *
 * ENDPOINTS:
 *   GET    /api/trades              — list trades with optional filters
 *   POST   /api/trades              — create a manual trade
 *   PUT    /api/trades              — update journal fields on a trade
 *   DELETE /api/trades              — delete a manual trade (synced trades can't be deleted)
 *
 * POSITION ID STRATEGY:
 *   - MT5 synced trades: large positive numbers (100000+)
 *   - Manual trades: negative numbers (from manual_trade_position_seq)
 *   - This separation ensures zero collision even at massive scale
 *
 * RELATED FILES:
 *   - lib/db.ts — DbTrade interface (defines all trade columns)
 *   - lib/normalizer.ts — handles MT5 deal → trade conversion
 *   - 004_journal_system.sql — adds source, journal columns, sequence
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, serverError, ok, notFoundResponse } from "@/lib/api-helpers";

/**
 * GET /api/trades — fetch trades with optional filters.
 *
 * Query params:
 *   account_id  — filter to a specific account (required)
 *   source      — filter by 'sync' or 'manual' (optional)
 *   from        — ISO date, close_time >= this (optional)
 *   to          — ISO date, close_time <= this (optional)
 *   limit       — max rows, default 50 (optional)
 *   offset      — pagination offset, default 0 (optional)
 *
 * Returns trades ordered by close_time descending (most recent first).
 */
export async function GET(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  const source    = url.searchParams.get("source");
  const from      = url.searchParams.get("from");
  const to        = url.searchParams.get("to");
  const limit     = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset    = parseInt(url.searchParams.get("offset") ?? "0", 10);

  if (!accountId) {
    return badRequest("account_id is required");
  }

  // Verify the user owns this account (prevent data leakage)
  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return notFoundResponse("Account not found");
  }

  // Build query with optional filters
  let q = supa
    .from("trades")
    .select("*")
    .eq("account_id", accountId)
    .order("close_time", { ascending: false })
    .range(offset, offset + limit - 1);

  if (source)  q = q.eq("source", source);
  if (from)    q = q.gte("close_time", from);
  if (to)      q = q.lte("close_time", to);

  const { data: trades, error } = await q;

  if (error) {
    return serverError(error.message);
  }

  return ok({ trades });
}

/**
 * POST /api/trades — create a manual trade entry.
 *
 * Manual trades bypass the MT5 sync pipeline and are inserted directly.
 * They use a negative position_id from the manual_trade_position_seq
 * sequence to avoid collision with MT5 position IDs.
 *
 * Expected body: {
 *   account_id: string (required — which account this trade belongs to),
 *   symbol: string (required — e.g. "EURUSD"),
 *   direction: "buy" | "sell" (required),
 *   lot_size: number (required),
 *   open_price: number (required),
 *   close_price: number (required),
 *   open_time: string (required — ISO timestamp),
 *   close_time: string (required — ISO timestamp),
 *   sl?: number,
 *   tp?: number,
 *   commission?: number,
 *   swap?: number,
 *   notes?: string,
 *   tags?: string[],
 *   playbook_id?: string,
 *   trade_thesis?: string,
 *   confidence?: number (1-5),
 * }
 *
 * The API auto-calculates: pnl, pnl_pips, net_pnl, duration_minutes.
 */
export async function POST(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json();

  // Validate required fields
  const required = ["account_id", "symbol", "direction", "lot_size", "open_price", "close_price", "open_time", "close_time"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return badRequest(`${field} is required.`);
    }
  }

  // Validate direction
  if (!["buy", "sell"].includes(body.direction)) {
    return badRequest("Direction must be 'buy' or 'sell'.");
  }

  // Validate confidence if provided (must be 1-5)
  if (body.confidence !== undefined && (body.confidence < 1 || body.confidence > 5)) {
    return badRequest("Confidence must be between 1 and 5.");
  }

  // Verify the user owns this account
  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", body.account_id)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return notFoundResponse("Account not found");
  }

  // Generate a unique negative position_id from the sequence
  // This ensures manual trades never collide with MT5 synced trades
  const { data: seqData, error: seqError } = await supa.rpc("nextval_manual_trade_position_seq");

  // Fallback: if the RPC doesn't exist yet, generate a random negative ID
  let positionId: number;
  if (seqError || !seqData) {
    positionId = -Math.floor(Math.random() * 1_000_000_000);
  } else {
    positionId = seqData;
  }

  // ─── Calculate derived fields ─────────────────────────────────────
  const openPrice  = parseFloat(body.open_price);
  const closePrice = parseFloat(body.close_price);
  const lotSize    = parseFloat(body.lot_size);
  const commission = parseFloat(body.commission ?? "0");
  const swap       = parseFloat(body.swap ?? "0");

  // Calculate raw P&L based on direction
  // For buy: profit = (close - open) * lot_size * contract_size
  // For forex pairs, approximate using lot_size * pip_diff * pip_value
  // Simplified: store the raw price difference P&L
  const priceDiff = body.direction === "buy"
    ? closePrice - openPrice
    : openPrice - closePrice;

  // Approximate pip size for the symbol (same logic as normalizer.ts)
  const symbol = body.symbol.toUpperCase();
  const pipSize = getPipSize(symbol);
  const pnlPips = priceDiff / pipSize;

  // For P&L in account currency, we use a simplified calculation
  // (accurate for USD-denominated accounts on most pairs)
  // lot_size * contract_size_standard(100000) * price_diff
  const contractSize = symbol.includes("XAU") ? 100 :
                       symbol.includes("XAG") ? 5000 :
                       symbol.includes("US30") || symbol.includes("NAS") || symbol.includes("SPX") ? 1 :
                       100000; // standard forex lot
  const pnl    = priceDiff * lotSize * contractSize;
  const netPnl = pnl + commission + swap;

  // Calculate duration in minutes between open and close
  const openTime  = new Date(body.open_time);
  const closeTime = new Date(body.close_time);
  const durationMinutes = Math.round((closeTime.getTime() - openTime.getTime()) / 60000);

  // ─── Insert the manual trade ──────────────────────────────────────
  const { data: trade, error } = await supa
    .from("trades")
    .insert({
      account_id:       body.account_id,
      position_id:      positionId,
      symbol:           symbol,
      direction:        body.direction,
      lot_size:         lotSize,
      open_price:       openPrice,
      close_price:      closePrice,
      sl:               body.sl ? parseFloat(body.sl) : null,
      tp:               body.tp ? parseFloat(body.tp) : null,
      open_time:        body.open_time,
      close_time:       body.close_time,
      duration_minutes: durationMinutes,
      pnl:              pnl,
      pnl_pips:         pnlPips,
      commission:       commission,
      swap:             swap,
      net_pnl:          netPnl,
      source:           "manual",
      // Journal fields (optional, set at creation time)
      tags:             body.tags ?? [],
      notes:            body.notes?.trim() || null,
      playbook_id:      body.playbook_id || null,
      trade_thesis:     body.trade_thesis?.trim() || null,
      confidence:       body.confidence ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return ok({ trade }, 201);
}

/**
 * PUT /api/trades — update journal fields on a trade.
 *
 * Works for both synced and manual trades. Only journal-related fields
 * can be updated — core trade data (price, lots, etc.) is immutable
 * for synced trades (to preserve integrity with MT5 data).
 *
 * Expected body: {
 *   id: string (required — trade UUID),
 *   notes?: string,
 *   tags?: string[],
 *   setup_type?: string,
 *   trade_thesis?: string,
 *   planned_rr?: number,
 *   confidence?: number (1-5),
 *   execution_rating?: number (1-5),
 *   setup_rating?: number (1-5),
 *   went_right?: string,
 *   went_wrong?: string,
 *   lessons?: string,
 *   mood_entry?: string,
 *   mood_exit?: string,
 *   emotion_notes?: string,
 *   playbook_id?: string | null,
 *   mistake_ids?: string[],
 * }
 */
export async function PUT(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const body = await req.json();

  if (!body.id) {
    return badRequest("Trade ID is required.");
  }

  // Whitelist of journal fields that can be updated
  // Core trade data (prices, lots, times) is NOT editable via this endpoint
  const JOURNAL_FIELDS = [
    "notes", "tags", "setup_type", "trade_thesis", "planned_rr",
    "confidence", "execution_rating", "setup_rating",
    "went_right", "went_wrong", "lessons",
    "mood_entry", "mood_exit", "emotion_notes",
    "playbook_id", "mistake_ids", "screenshot_urls",
  ];

  // Build update object from only allowed fields
  const updates: Record<string, unknown> = {};
  for (const field of JOURNAL_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  // Verify the user owns this trade (via the linked account)
  const { data: trade } = await supa
    .from("trades")
    .select("id, account_id")
    .eq("id", body.id)
    .single();

  if (!trade) {
    return notFoundResponse("Trade not found.");
  }

  // Verify ownership through the account → user_id chain
  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", trade.account_id)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return unauthorized();
  }

  // Perform the update
  const { data: updated, error } = await supa
    .from("trades")
    .update(updates)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return serverError(error.message);
  }

  return ok({ trade: updated });
}

/**
 * DELETE /api/trades — delete a manual trade.
 *
 * ONLY manual trades (source = 'manual') can be deleted.
 * Synced trades from MT5 cannot be deleted through this API —
 * they represent real broker-confirmed transactions.
 *
 * Expected body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  // --- Auth check ---
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { id } = await req.json() as { id: string };
  if (!id) {
    return badRequest("Trade ID is required.");
  }

  // Fetch the trade to verify ownership and check if it's manual
  const { data: trade } = await supa
    .from("trades")
    .select("id, account_id, source")
    .eq("id", id)
    .single();

  if (!trade) {
    return notFoundResponse("Trade not found.");
  }

  // Only manual trades can be deleted
  if (trade.source !== "manual") {
    return badRequest("Synced trades cannot be deleted. Only manually entered trades can be removed.");
  }

  // Verify ownership through the account → user_id chain
  const { data: account } = await supa
    .from("accounts")
    .select("id")
    .eq("id", trade.account_id)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return unauthorized();
  }

  // Delete the trade
  const { error } = await supa
    .from("trades")
    .delete()
    .eq("id", id);

  if (error) {
    return serverError(error.message);
  }

  return ok({ success: true });
}

// ─── Helper: Get pip size for a symbol ────────────────────────────────
// Mirrors the logic in lib/normalizer.ts for consistency
/**
 * Returns the pip size for a given trading symbol.
 *
 * Standard forex pairs use 0.0001 (4-decimal pricing).
 * JPY pairs use 0.01 (2-decimal pricing).
 * Metals and indices have their own pip definitions.
 *
 * This is used when calculating pnl_pips for manual trade entries.
 */
function getPipSize(symbol: string): number {
  const s = symbol.toUpperCase();

  // JPY pairs — 0.01 pips
  if (s.includes("JPY")) return 0.01;

  // Gold (XAUUSD) — 0.1 pips
  if (s.includes("XAU")) return 0.1;

  // Silver (XAGUSD) — 0.01 pips
  if (s.includes("XAG")) return 0.01;

  // Indices — 1.0 pip
  if (s.includes("US30") || s.includes("NAS") || s.includes("SPX") ||
      s.includes("US100") || s.includes("US500")) return 1.0;

  // Default: standard forex pair — 0.0001 pips
  return 0.0001;
}
