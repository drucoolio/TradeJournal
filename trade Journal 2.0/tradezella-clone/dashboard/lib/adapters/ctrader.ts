/**
 * lib/adapters/ctrader.ts — cTrader broker adapter (stub).
 *
 * Will call the cTrader Open API directly from the Mac — no VPS needed.
 * Implementation coming in a future phase.
 */

import type {
  BrokerAdapter,
  BrokerAccount,
  BrokerCredentials,
  ClosedDeal,
  OpenPosition,
} from "@/lib/broker";

export const ctraderAdapter: BrokerAdapter = {
  async connect(_credentials: BrokerCredentials): Promise<BrokerAccount> {
    // TODO: implement cTrader Open API OAuth flow
    throw new Error(
      "cTrader support is coming soon. Please use MetaTrader 5 for now.",
    );
  },

  async getOpenPositions(): Promise<OpenPosition[]> {
    throw new Error("cTrader support is coming soon.");
  },

  async getAllDeals(): Promise<ClosedDeal[]> {
    throw new Error("cTrader support is coming soon.");
  },
};
