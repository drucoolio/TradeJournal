/**
 * lib/adapters/index.ts — Factory: returns the right adapter for a broker.
 */

import type { BrokerAdapter, BrokerType } from "@/lib/broker";
import { mt5Adapter } from "./mt5";
import { ctraderAdapter } from "./ctrader";

export function getAdapter(broker: BrokerType): BrokerAdapter {
  switch (broker) {
    case "mt5":
      return mt5Adapter;
    case "ctrader":
      return ctraderAdapter;
  }
}
