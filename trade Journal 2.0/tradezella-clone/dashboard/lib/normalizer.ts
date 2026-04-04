/**
 * lib/normalizer.ts — TypeScript port of mac/normalizer.py
 *
 * PURPOSE: Convert the raw array of MT5 deals (from VPS GET /history) into
 * clean "TradeRow" objects that map 1:1 to rows in the `trades` Supabase table.
 *
 * WHY THIS IS NEEDED — MT5 DEAL STRUCTURE:
 *   MT5 represents a complete round-trip trade as TWO separate "deal" records:
 *
 *     deal.entry == 0  (DEAL_ENTRY_IN)  — position was opened at this price/time
 *     deal.entry == 1  (DEAL_ENTRY_OUT) — position was closed at this price/time
 *
 *   Both deals share the same `position_id`. The normalizer groups deals by
 *   position_id and merges the IN + OUT pair into a single TradeRow with:
 *     - open_price / open_time from the IN deal
 *     - close_price / close_time / profit from the OUT deal
 *     - commission and swap summed across both deals
 *
 * PARTIAL CLOSES:
 *   When a position is partially closed (e.g. 50% of the position at a time),
 *   MT5 generates multiple OUT deals for the same position_id. Currently we
 *   keep only the LAST OUT deal per position. This means partial close data
 *   is aggregated to a single close event — acceptable for now, can be refined later.
 *
 * USAGE:
 *   const rows = normalizeDeals(historyResponse.deals);
 *   // rows is now ready for Supabase upsert via tradeRowToSupabase()
 */

// ---------------------------------------------------------------------------
// Pip size table — maps symbol → pip value for pip P&L calculation
// ---------------------------------------------------------------------------

/**
 * Pip sizes for common symbols.
 * For forex: 1 pip = 0.0001 for 4-decimal pairs, 0.01 for JPY pairs.
 * For metals: XAUUSD 1 pip = $0.10 (price in USD, tick = 0.01).
 * For indices: 1 pip = 1 full point on US30, 0.1 on US500/NAS100.
 * For crypto: 1 pip = $1 on BTCUSD.
 *
 * Unknown symbols fall back to DEFAULT_PIP_SIZE (0.0001) — pips will be
 * inaccurate but the dollar P&L values are always correct.
 */
const PIP_SIZES: Record<string, number> = {
  // Forex majors / minors
  EURUSD: 0.0001, GBPUSD: 0.0001, AUDUSD: 0.0001,
  NZDUSD: 0.0001, USDCAD: 0.0001, USDCHF: 0.0001,
  EURGBP: 0.0001, EURJPY: 0.01,   GBPJPY: 0.01,
  USDJPY: 0.01,   AUDJPY: 0.01,   CADJPY: 0.01,
  CHFJPY: 0.01,   NZDJPY: 0.01,
  // Metals (spot)
  XAUUSD: 0.1,    XAGUSD: 0.001,
  // Equity indices (CFDs)
  US30: 1.0,      US500: 0.1,     NAS100: 0.1,
  GER40: 0.1,     UK100: 0.1,
  // Crypto
  BTCUSD: 1.0,    ETHUSD: 0.1,
};

/** Fallback for symbols not in the table above */
const DEFAULT_PIP_SIZE = 0.0001;

/**
 * Looks up the pip size for a symbol.
 * Strips trailing "M" (micro lots suffix some brokers append) and trailing
 * dots before looking up. Falls back to DEFAULT_PIP_SIZE if unknown.
 *
 * @param symbol — MT5 symbol string e.g. "EURUSD", "EURUSDM", "XAUUSD."
 */
function getPipSize(symbol: string): number {
  // Remove broker-specific suffixes: trailing "M" (micro) or "." (some brokers)
  const clean = symbol.toUpperCase().replace(/M$/, "").replace(/\.$/, "");
  return PIP_SIZES[clean] ?? PIP_SIZES[symbol.toUpperCase()] ?? DEFAULT_PIP_SIZE;
}

// ---------------------------------------------------------------------------
// Types — input (RawDeal) and output (TradeRow) shapes
// ---------------------------------------------------------------------------

/**
 * Raw deal object as received from the VPS /history endpoint.
 * Fields mirror the MT5 TradeDeal structure with some optional fields
 * because not all fields are available for all deal types.
 */
export interface RawDeal {
  ticket: number;       // unique deal ticket
  order?: number;       // order that generated this deal
  position_id: number;  // links entry and exit deals for the same position
  symbol: string;       // instrument (e.g. "EURUSD")
  type?: number;        // deal type: 0 = buy order, 1 = sell order
  entry: number;        // 0 = ENTRY_IN (opening), 1 = ENTRY_OUT (closing)
  lot_size?: number;    // volume in lots
  price?: number;       // execution price of this deal
  time?: string;        // ISO-8601 UTC timestamp
  commission?: number;  // broker commission for this half of the trade (negative)
  swap?: number;        // overnight financing charge (positive or negative)
  profit?: number;      // profit from this deal (0 for entry deals)
  sl?: number;          // stop-loss level (only set on entry deals; 0 = not set)
  tp?: number;          // take-profit level (only set on entry deals; 0 = not set)
  comment?: string;     // trade comment
  magic?: number;       // EA identifier (0 = manual trade)
}

/**
 * One completed trade ready for storage in Supabase.
 * Produced by merging the IN + OUT deals for a single position_id.
 */
export interface TradeRow {
  position_id:      number;           // MT5 position ID (unique per account)
  ticket:           number | null;    // ticket of the closing (OUT) deal
  symbol:           string;
  direction:        "buy" | "sell";   // the original trade direction
  lot_size:         number;
  open_price:       number | null;    // price at which position was entered
  close_price:      number | null;    // price at which position was closed
  sl:               number | null;    // stop-loss (from the entry deal)
  tp:               number | null;    // take-profit (from the entry deal)
  open_time:        string | null;    // ISO-8601 timestamp of entry
  close_time:       string | null;    // ISO-8601 timestamp of exit
  duration_minutes: number | null;    // time held in whole minutes
  pnl:              number;           // gross profit/loss (from MT5, before fees)
  pnl_pips:         number | null;    // pnl expressed in pips (for position sizing analysis)
  commission:       number;           // total commission (entry + exit deals summed)
  swap:             number;           // total swap (entry + exit deals summed)
  net_pnl:          number;           // pnl + commission + swap = actual money made/lost
}

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

const ENTRY_IN  = 0; // MT5 DEAL_ENTRY_IN  — deal opens the position
const ENTRY_OUT = 1; // MT5 DEAL_ENTRY_OUT — deal closes the position

/**
 * Computes how many whole minutes elapsed between two ISO-8601 timestamps.
 * Returns 0 if the result would be negative (data quality issue).
 */
function durationMinutes(openIso: string, closeIso: string): number {
  const delta = new Date(closeIso).getTime() - new Date(openIso).getTime();
  return Math.max(0, Math.floor(delta / 60_000));
}

/**
 * Converts a price move into pips, adjusting for trade direction.
 *
 * For a BUY trade: pips = (close - open) / pipSize   (positive = profit)
 * For a SELL trade: pips = (open - close) / pipSize  (positive = profit)
 *
 * Rounded to 1 decimal place to avoid floating-point noise.
 */
function calcPips(
  openPrice: number,
  closePrice: number,
  direction: "buy" | "sell",
  symbol: string,
): number {
  const pip = getPipSize(symbol);
  const raw = (closePrice - openPrice) / pip;
  // Negate for sells: a lower close price is profit when short
  return Math.round((direction === "buy" ? raw : -raw) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Core normalizer — groups deals by position_id and merges pairs
// ---------------------------------------------------------------------------

/**
 * Converts an array of raw MT5 deals into an array of complete TradeRows.
 *
 * Algorithm:
 *  1. Group all deals by position_id into { in: RawDeal | null, out: RawDeal | null }
 *  2. Skip positions that have no OUT deal (still open)
 *  3. For each paired position, derive direction from the exit deal type,
 *     sum up commission and swap from both deals, compute pips and net_pnl
 *  4. Sort results by close_time ascending (chronological order)
 *
 * Idempotent: running this on the same deals multiple times produces the same
 * output, which is required for the upsert-based sync to be safe.
 */
export function normalizeDeals(deals: RawDeal[]): TradeRow[] {
  // Step 1: Group deals by position_id
  // Each entry tracks the opening deal (IN) and closing deal (OUT) separately
  const byPosition = new Map<number, { in: RawDeal | null; out: RawDeal | null }>();

  for (const deal of deals) {
    // Fallback to ticket if position_id is missing (shouldn't happen, defensive)
    const pid = deal.position_id ?? deal.ticket;
    if (!byPosition.has(pid)) {
      byPosition.set(pid, { in: null, out: null });
    }
    const pair = byPosition.get(pid)!;

    if (deal.entry === ENTRY_IN) {
      pair.in = deal; // store the opening deal
    } else if (deal.entry === ENTRY_OUT) {
      // For partial closes: overwrite with the latest OUT deal.
      // This means we capture the final close, not intermediate partials.
      pair.out = deal;
    }
    // entry > 1 exists (e.g. DEAL_ENTRY_INOUT for some brokers) — ignored for now
  }

  // Step 2 & 3: Build TradeRow for each completed position
  const rows: TradeRow[] = [];

  for (const [pid, pair] of Array.from(byPosition.entries())) {
    const outDeal = pair.out;
    const inDeal  = pair.in;

    // Skip positions without an exit deal — still open (or data is incomplete)
    if (!outDeal) continue;

    // DIRECTION LOGIC (MT5 quirk):
    // The exit deal type indicates what action CLOSED the position:
    //   exit type 1 (sell order) → the original trade was a BUY (sold to close)
    //   exit type 0 (buy order)  → the original trade was a SELL (bought to cover)
    const exitType  = outDeal.type ?? 0;
    const direction: "buy" | "sell" = exitType === 1 ? "buy" : "sell";

    // Extract prices and times from the respective deals
    const openPrice  = inDeal?.price  ?? null;
    const closePrice = outDeal.price   ?? null;
    const openTime   = inDeal?.time   ?? null;
    const closeTime  = outDeal.time    ?? null;

    // SL/TP: only available on the entry deal; treat 0 as "not set"
    const sl = (inDeal?.sl && inDeal.sl !== 0) ? inDeal.sl : null;
    const tp = (inDeal?.tp && inDeal.tp !== 0) ? inDeal.tp : null;

    // Duration: only computable if we have both timestamps
    const duration =
      openTime && closeTime ? durationMinutes(openTime, closeTime) : null;

    // FINANCIAL CALCULATIONS:
    // Gross P&L (profit) comes from the exit deal only (MT5 calculates it there)
    const pnl        = outDeal.profit    ?? 0;
    // Commission is split between entry and exit deals — we need both halves
    const commission = (outDeal.commission ?? 0) + (inDeal?.commission ?? 0);
    // Swap is similarly split across both deals
    const swap       = (outDeal.swap      ?? 0) + (inDeal?.swap       ?? 0);
    // Net P&L = what actually lands in the account (commission and swap are negative)
    const netPnl     = pnl + commission + swap;

    // Pips: only calculable if we have both prices
    const pnlPips =
      openPrice !== null && closePrice !== null
        ? calcPips(openPrice, closePrice, direction, outDeal.symbol)
        : null;

    rows.push({
      position_id:      pid,
      ticket:           outDeal.ticket ?? null,
      symbol:           outDeal.symbol,
      direction,
      lot_size:         outDeal.lot_size ?? 0,
      open_price:       openPrice,
      close_price:      closePrice,
      sl,
      tp,
      open_time:        openTime,
      close_time:       closeTime,
      duration_minutes: duration,
      pnl,
      pnl_pips:         pnlPips,
      commission,
      swap,
      net_pnl:          netPnl,
    });
  }

  // Sort by close_time ascending so the array is ready for charts
  rows.sort((a, b) => (a.close_time ?? "").localeCompare(b.close_time ?? ""));
  return rows;
}

/**
 * Converts a TradeRow into the flat object shape expected by Supabase upsert.
 *
 * The account_id is injected here (not in the TradeRow itself) because
 * normalizeDeals doesn't know which account the deals belong to —
 * that context is provided by the sync route.
 *
 * Returns a Record<string, unknown> because Supabase's .upsert() is typed
 * generically. TypeScript will verify column names at the Supabase query level.
 */
export function tradeRowToSupabase(row: TradeRow, accountId: string): Record<string, unknown> {
  return {
    account_id:       accountId,  // FK linking trade to its account
    position_id:      row.position_id,
    ticket:           row.ticket,
    symbol:           row.symbol,
    direction:        row.direction,
    lot_size:         row.lot_size,
    open_price:       row.open_price,
    close_price:      row.close_price,
    sl:               row.sl,
    tp:               row.tp,
    open_time:        row.open_time,
    close_time:       row.close_time,
    duration_minutes: row.duration_minutes,
    pnl:              row.pnl,
    pnl_pips:         row.pnl_pips,
    commission:       row.commission,
    swap:             row.swap,
    net_pnl:          row.net_pnl,
    // Note: user-editable fields (tags, notes, setup_type, mood, mistakes,
    // screenshot_url) are intentionally omitted so syncs don't overwrite
    // the user's journal notes. Supabase upsert leaves existing values alone
    // for columns not included in the upsert payload.
  };
}
