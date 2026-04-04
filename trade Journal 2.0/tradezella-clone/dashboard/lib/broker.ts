/**
 * lib/broker.ts — Unified broker types and adapter interface.
 *
 * Every broker (MT5, cTrader, etc.) implements BrokerAdapter and maps
 * its raw API data into these unified types. The dashboard only ever
 * sees these types — it never knows which broker is underneath.
 */

// ---------------------------------------------------------------------------
// Broker identity
// ---------------------------------------------------------------------------

export type BrokerType = "mt5" | "ctrader";

export interface BrokerMeta {
  id: BrokerType;
  label: string;
  description: string;
  available: boolean; // false = coming soon
}

export const BROKERS: BrokerMeta[] = [
  {
    id: "mt5",
    label: "MetaTrader 5",
    description: "Connect via your VPS bridge",
    available: true,
  },
  {
    id: "ctrader",
    label: "cTrader",
    description: "Connect via cTrader Open API",
    available: false, // Phase 2 of broker support
  },
];

// ---------------------------------------------------------------------------
// Unified account info
// ---------------------------------------------------------------------------

export interface BrokerAccount {
  broker: BrokerType;
  login: string;       // account number (string so cTrader IDs work too)
  name: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  leverage: number;
}

// ---------------------------------------------------------------------------
// Unified trade / deal types
// ---------------------------------------------------------------------------

export interface OpenPosition {
  id: string;           // unique identifier
  symbol: string;
  direction: "buy" | "sell";
  lot_size: number;
  open_price: number;
  current_price: number;
  sl: number;
  tp: number;
  open_time: string;    // ISO-8601
  swap: number;
  profit: number;
}

export interface ClosedDeal {
  id: string;
  symbol: string;
  direction: "buy" | "sell";
  lot_size: number;
  open_price?: number;  // not always available depending on broker
  close_price: number;
  open_time?: string;
  close_time: string;   // ISO-8601
  profit: number;
  commission: number;
  swap: number;
}

// ---------------------------------------------------------------------------
// Credentials — one union type per broker
// ---------------------------------------------------------------------------

export interface MT5Credentials {
  broker: "mt5";
  login: number;
  password: string;   // investor (read-only) password
  server: string;
}

export interface CTraderCredentials {
  broker: "ctrader";
  accessToken: string;
  accountId: string;
}

export type BrokerCredentials = MT5Credentials | CTraderCredentials;

// ---------------------------------------------------------------------------
// Adapter interface — every broker must implement this
// ---------------------------------------------------------------------------

export interface BrokerAdapter {
  /**
   * Authenticate and return account info.
   * Should throw an Error with a human-readable message on failure.
   */
  connect(credentials: BrokerCredentials): Promise<BrokerAccount>;

  /** Currently open positions. */
  getOpenPositions(): Promise<OpenPosition[]>;

  /** Full closed deal history. */
  getAllDeals(): Promise<ClosedDeal[]>;
}
