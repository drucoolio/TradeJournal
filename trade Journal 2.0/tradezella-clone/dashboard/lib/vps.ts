/**
 * lib/vps.ts — HTTP client for the VPS FastAPI bridge.
 *
 * The VPS runs MetaTrader 5 via the Python MetaTrader5 library and exposes
 * MT5 data over a REST API. This file is the ONLY place in the Next.js app
 * that talks directly to the VPS.
 *
 * SECURITY: This file must only be imported by server-side code (API routes,
 * Server Components). The VPS_URL and VPS_API_KEY env vars are not prefixed
 * with NEXT_PUBLIC_ so they are never embedded in the client bundle.
 *
 * VPS endpoints:
 *   POST /connect     — log into an MT5 account (login, investor pw, server)
 *   GET  /account     — current account balance, equity, margin
 *   GET  /trades      — open positions + recently closed deals (last N hours)
 *   GET  /history     — full deal history (optionally filtered by date range)
 *   GET  /health      — liveness probe
 */

// Read from environment — no NEXT_PUBLIC_ prefix so these stay server-side only
const VPS_URL     = process.env.VPS_URL ?? "http://79.108.225.44:8000";
const VPS_API_KEY = process.env.VPS_API_KEY ?? "";

// Base headers sent with every request. The X-API-Key header authenticates
// us to the VPS FastAPI app, which validates it against its own env var.
const baseHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  // Only add the auth header if a key is configured — allows local dev without key
  ...(VPS_API_KEY ? { "X-API-Key": VPS_API_KEY } : {}),
};

// ---------------------------------------------------------------------------
// Response type definitions — mirror the FastAPI response models on the VPS
// ---------------------------------------------------------------------------

/**
 * Account info returned by POST /connect and GET /account.
 * These fields come directly from MT5's AccountInfo() function.
 */
export interface AccountInfo {
  login: number;        // MT5 account number
  name: string;         // account owner name
  server: string;       // broker server (e.g. "FundedNext-Server 2")
  currency: string;     // account currency (e.g. "USD")
  balance: number;      // cash balance (does not include open P&L)
  equity: number;       // balance + unrealised P&L from open positions
  margin: number;       // margin currently in use
  margin_free: number;  // available free margin
  leverage: number;     // account leverage (e.g. 100 for 1:100)
}

/** Shape of POST /connect response on success. */
export interface ConnectResponse {
  status: "connected";
  account: AccountInfo;
}

/**
 * One open position (currently live trade, not yet closed).
 * These come from MT5's positions_get() function.
 */
export interface OpenPosition {
  ticket: number;          // unique position ticket
  symbol: string;          // instrument e.g. "EURUSD"
  direction: "buy" | "sell";
  lot_size: number;        // position size in lots
  open_price: number;      // price at which position was opened
  current_price: number;   // live bid/ask price (mark-to-market)
  sl: number;              // stop-loss price (0 if not set)
  tp: number;              // take-profit price (0 if not set)
  open_time: string;       // ISO-8601 UTC timestamp
  swap: number;            // accumulated swap charges so far
  profit: number;          // unrealised profit/loss in account currency
  comment: string;         // trade comment (often EA name or manual note)
  magic: number;           // EA magic number (0 for manual trades)
  status: "open";          // always "open" for positions from this endpoint
}

/**
 * One MT5 deal (an individual transaction event).
 *
 * MT5 QUIRK: Every complete trade consists of TWO deals:
 *   entry == 0 (DEAL_ENTRY_IN)  — when the position was opened
 *   entry == 1 (DEAL_ENTRY_OUT) — when the position was closed
 *
 * Both deals share the same position_id. The normalizer pairs them up to
 * produce one TradeRow per round-trip. Partial closes produce multiple
 * OUT deals — the normalizer currently keeps the last OUT deal naively.
 */
export interface Deal {
  ticket: number;      // unique deal ticket
  order: number;       // order that generated this deal
  position_id: number; // links entry and exit deals together
  symbol: string;
  direction: "buy" | "sell"; // direction of the deal (not the original trade)
  lot_size: number;
  price: number;       // execution price of this deal
  time: string;        // ISO-8601 UTC timestamp of execution
  commission: number;  // commission for this half of the trade (usually negative)
  swap: number;        // swap for this half of the trade
  profit: number;      // profit from this deal (0 for ENTRY deals)
  comment: string;
  magic: number;
  entry: number;       // 0 = IN (opening), 1 = OUT (closing)
}

/** Response shape from GET /trades */
export interface TradesResponse {
  open_positions: OpenPosition[];
  recent_deals: Deal[];
  meta: {
    open_count: number;
    recent_deals_count: number;
    lookback_hours: number;
    fetched_at_utc: string;
  };
}

/** Response shape from GET /history */
export interface HistoryResponse {
  deals: Deal[];        // all deals (both IN and OUT) for the date range
  meta: {
    count: number;
    from_date: string | null;
    to_date: string;
    fetched_at_utc: string;
  };
}

/** Response shape from GET /health */
export interface HealthResponse {
  status: string;
  mt5_connected: boolean;
  server_time_utc: string;
}

// ---------------------------------------------------------------------------
// VPS error class
// ---------------------------------------------------------------------------

/**
 * Thrown when the VPS returns a non-2xx HTTP response.
 * Carries the HTTP status code so callers can distinguish 401 (bad password)
 * from 504 (timeout) and show the user an appropriate error message.
 */
export class VpsError extends Error {
  constructor(
    public readonly statusCode: number, // HTTP status code from the VPS response
    message: string,                    // human-readable error detail from VPS JSON
  ) {
    super(message);
    this.name = "VpsError";
  }
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Typed fetch wrapper for all VPS API calls.
 *
 * Handles:
 *  - Prepending the VPS base URL
 *  - Injecting auth + content-type headers
 *  - Disabling Next.js fetch caching (cache: "no-store") — we always want live data
 *  - Timeout via AbortController: if the VPS doesn't respond in timeoutMs, the
 *    fetch is aborted and throws an AbortError (caught by callers as a timeout)
 *  - Extracting error detail from the VPS JSON response on non-2xx status
 *
 * Generic T allows TypeScript to type-check the returned JSON shape.
 */
async function vfetch<T>(
  path: string,          // URL path e.g. "/account"
  init?: RequestInit,    // optional fetch options (method, body)
  timeoutMs = 20_000,    // default 20-second timeout for most calls
): Promise<T> {
  // AbortController lets us cancel the fetch after a timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${VPS_URL}${path}`, {
      ...init,
      headers: { ...baseHeaders, ...(init?.headers ?? {}) },
      cache: "no-store", // always fetch fresh — never use Next.js data cache
      signal: controller.signal, // attach abort signal for timeout
    });
  } finally {
    clearTimeout(timer); // always cancel the timer to prevent memory leak
  }

  if (!res.ok) {
    // Try to extract a human-readable error from the FastAPI response body
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {} // if body isn't valid JSON, use statusText
    throw new VpsError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API — one function per VPS endpoint
// ---------------------------------------------------------------------------

/**
 * GET /health — liveness check for the VPS bridge.
 * Returns whether MT5 is currently connected and the current server time.
 * Use this to test connectivity before attempting a sync.
 */
export async function vpsHealth(): Promise<HealthResponse> {
  return vfetch<HealthResponse>("/health");
}

/**
 * POST /connect — authenticate an MT5 account on the VPS.
 *
 * Sends login, password, and server to the VPS which calls MT5's
 * initialize() and login() functions. Returns the full account info
 * if successful.
 *
 * Uses a 30-second timeout (vs the default 20s) because MT5 connecting
 * to a broker server for the first time can be slow — especially for
 * prop firm servers like FundedNext that have high latency.
 *
 * After calling this, the VPS "remembers" the active account until the
 * next connect call (it holds the MT5 session in memory). All subsequent
 * /account, /trades, /history calls use this active session.
 */
export async function vpsConnect(
  login: number,    // MT5 account number (numeric, not string)
  password: string, // investor (read-only) password — we never store master passwords
  server: string,   // broker server name (must match exactly, e.g. "FundedNext-Server 2")
): Promise<ConnectResponse> {
  // Allow 30 seconds for MT5 to authenticate with the broker server
  return vfetch<ConnectResponse>(
    "/connect",
    { method: "POST", body: JSON.stringify({ login, password, server }) },
    30_000,
  );
}

/**
 * GET /account — fetch current account balance and margin info.
 * Requires a previous successful /connect call on the VPS.
 * Used during sync to update the accounts table with fresh balance data.
 */
export async function vpsAccount(): Promise<AccountInfo> {
  return vfetch<AccountInfo>("/account");
}

/**
 * GET /trades — open positions and recently closed deals.
 *
 * @param lookbackHours — how many hours of recent deals to include.
 *   Default 24h. Increase if you want to see trades from the past week.
 *   Note: this endpoint is used for the open positions widget, not for
 *   building the trade history (use vpsHistory for that).
 */
export async function vpsTrades(lookbackHours = 24): Promise<TradesResponse> {
  return vfetch<TradesResponse>(`/trades?lookback_hours=${lookbackHours}`);
}

/**
 * GET /history — full deal history for the MT5 account.
 *
 * Returns ALL deals (both entry and exit) optionally filtered by date range.
 * This is the source data for the sync process — normalizer.ts pairs these
 * deals into complete TradeRow objects.
 *
 * Uses a 60-second timeout because a full history fetch can return thousands
 * of deals and the VPS may be slow to query MT5 for all of them.
 *
 * @param fromDate — ISO date string "YYYY-MM-DD" (inclusive). Omit for full history.
 * @param toDate   — ISO date string "YYYY-MM-DD" (inclusive). Omit for up to today.
 */
export async function vpsHistory(fromDate?: string, toDate?: string): Promise<HistoryResponse> {
  // Build optional query parameters
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate)   params.set("to_date", toDate);
  const qs = params.toString() ? `?${params.toString()}` : "";

  // 60-second timeout — full history for an active account can be large
  return vfetch<HistoryResponse>(`/history${qs}`, undefined, 60_000);
}
