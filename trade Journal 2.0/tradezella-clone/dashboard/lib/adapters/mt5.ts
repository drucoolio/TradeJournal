/**
 * lib/adapters/mt5.ts — MT5 broker adapter.
 *
 * Implements the BrokerAdapter interface for MetaTrader 5 accounts by routing
 * calls through the VPS FastAPI bridge (lib/vps.ts). The dashboard never talks
 * to MT5 directly — all MT5 data flows through: MT5 → VPS Python lib → VPS
 * FastAPI → this adapter → dashboard.
 *
 * Why the adapter pattern?
 *   When we add cTrader support, the dashboard pages won't need to change.
 *   They call getAdapter(broker).getOpenPositions() — the adapter handles
 *   the broker-specific details and returns the unified OpenPosition type.
 *
 * Note: connect() is called server-side only (in /api/connect).
 * getOpenPositions() and getAllDeals() are also server-side (in /api/sync
 * and overview/page.tsx). This adapter must NEVER be imported in client code.
 */

import {
  vpsConnect,
  vpsTrades,
  vpsHistory,
  VpsError,
} from "@/lib/vps";
import type {
  BrokerAdapter,
  BrokerAccount,
  BrokerCredentials,
  ClosedDeal,
  OpenPosition,
} from "@/lib/broker";

/**
 * The MT5 adapter singleton — implements the BrokerAdapter interface.
 * Import this via lib/adapters/index.ts using getAdapter("mt5").
 */
export const mt5Adapter: BrokerAdapter = {

  /**
   * Authenticates an MT5 account via the VPS /connect endpoint.
   * Returns a BrokerAccount (unified type) on success, throws a human-readable
   * Error on failure so the /api/connect route can return it to the UI.
   *
   * Error handling:
   *  - VpsError: The VPS responded but rejected the credentials (e.g. wrong
   *    password, wrong server name). Re-throw with the VPS's error message.
   *  - Other errors (network timeout, ECONNRESET): The VPS is unreachable.
   *    Throw a generic "can't reach VPS" message.
   *
   * The login field comes in as a string (from JSON body) so we pass it
   * as-is — vpsConnect expects a number, so TypeScript will catch mismatches.
   */
  async connect(credentials: BrokerCredentials): Promise<BrokerAccount> {
    // Type guard: this adapter only handles MT5 credentials
    if (credentials.broker !== "mt5") {
      throw new Error("MT5 adapter received non-MT5 credentials.");
    }

    let result;
    try {
      result = await vpsConnect(
        credentials.login,    // MT5 account number (numeric)
        credentials.password, // investor (read-only) password
        credentials.server,   // broker server name e.g. "FundedNext-Server 2"
      );
    } catch (err) {
      if (err instanceof VpsError) {
        // VPS gave us a proper error message (wrong password, bad server, etc.)
        throw new Error(err.message);
      }
      // Network-level error — VPS is likely down or not reachable
      throw new Error(
        "Could not reach the VPS bridge. Check that it is running.",
      );
    }

    // Map VPS AccountInfo → unified BrokerAccount type
    const a = result.account;
    return {
      broker:      "mt5",
      login:       String(a.login), // stored as string so cTrader IDs (alphanumeric) work too
      name:        a.name,
      server:      a.server,
      currency:    a.currency,
      balance:     a.balance,
      equity:      a.equity,
      margin:      a.margin,
      margin_free: a.margin_free,
      leverage:    a.leverage,
    };
  },

  /**
   * Returns currently open positions for the active MT5 account.
   * "Active account" = whatever account was last connected via vpsConnect()
   * on the VPS process. The VPS holds this in memory.
   *
   * lookbackHours=24 fetches recent deals from the last 24h — we only
   * use the open_positions array from the response for this method.
   *
   * Maps VPS OpenPosition → unified OpenPosition type (id added as string).
   */
  async getOpenPositions(): Promise<OpenPosition[]> {
    const data = await vpsTrades(24); // 24-hour window for recent deals (not used here)
    return data.open_positions.map((p) => ({
      id:            String(p.ticket), // ticket is the unique identifier for open positions
      symbol:        p.symbol,
      direction:     p.direction,
      lot_size:      p.lot_size,
      open_price:    p.open_price,
      current_price: p.current_price, // live price — mark-to-market
      sl:            p.sl,
      tp:            p.tp,
      open_time:     p.open_time,
      swap:          p.swap,
      profit:        p.profit,        // unrealised P&L in account currency
    }));
  },

  /**
   * Returns all closed deals in the account's history.
   *
   * NOTE: This returns raw ClosedDeal objects (one per exit deal), NOT the
   * normalised TradeRows that the sync process produces. Use the normalizer
   * if you need matched open+close pairs.
   *
   * We filter to entry === 1 (DEAL_ENTRY_OUT) — only the closing deals carry
   * profit data. The entry deals (entry === 0) have profit = 0.
   *
   * This method is available for future use. The current sync process calls
   * vpsHistory() directly and passes all deals (IN + OUT) to normalizeDeals()
   * so that both sides of each trade can be matched.
   */
  async getAllDeals(): Promise<ClosedDeal[]> {
    const data = await vpsHistory(); // full history — no date range filter
    // Filter to exit deals only (entry === 1 = DEAL_ENTRY_OUT)
    return data.deals
      .filter((d) => d.entry === 1)
      .map((d) => ({
        id:          String(d.ticket),
        symbol:      d.symbol,
        direction:   d.direction,
        lot_size:    d.lot_size,
        close_price: d.price,   // for exit deals, price = close price
        close_time:  d.time,
        profit:      d.profit,
        commission:  d.commission,
        swap:        d.swap,
        // open_price and open_time are NOT available on exit deals —
        // they live on the matching entry deal, hence the optional fields
      }));
  },
};
