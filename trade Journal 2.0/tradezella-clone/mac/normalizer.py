"""
mac/normalizer.py — Maps raw MT5 deal data into clean trade rows.

MT5 represents each round-trip trade as TWO deals:
  - Entry deal  (entry == 0, DEAL_ENTRY_IN)  — position opened
  - Exit deal   (entry == 1, DEAL_ENTRY_OUT) — position closed

This module:
  1. Groups all deals by position_id
  2. Pairs each IN deal with its matching OUT deal
  3. Produces one clean TradeRow per completed round trip
  4. Computes derived fields: duration, pnl_pips, net_pnl
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# ---------------------------------------------------------------------------
# Pip sizes for common symbols
# Override / extend as needed for your instruments
# ---------------------------------------------------------------------------
PIP_SIZES: dict[str, float] = {
    # Forex majors / minors
    "EURUSD": 0.0001, "GBPUSD": 0.0001, "AUDUSD": 0.0001,
    "NZDUSD": 0.0001, "USDCAD": 0.0001, "USDCHF": 0.0001,
    "EURGBP": 0.0001, "EURJPY": 0.01,   "GBPJPY": 0.01,
    "USDJPY": 0.01,   "AUDJPY": 0.01,   "CADJPY": 0.01,
    "CHFJPY": 0.01,   "NZDJPY": 0.01,
    # Metals
    "XAUUSD": 0.1,    "XAGUSD": 0.001,
    # Indices (approximate — adjust per broker)
    "US30":   1.0,    "US500": 0.1,     "NAS100": 0.1,
    "GER40":  0.1,    "UK100": 0.1,
    # Crypto (approximate)
    "BTCUSD": 1.0,    "ETHUSD": 0.1,
}

DEFAULT_PIP_SIZE = 0.0001  # fallback for unknown symbols


def get_pip_size(symbol: str) -> float:
    """Return the pip size for a symbol, stripping broker suffixes like '.r'."""
    clean = symbol.upper().rstrip("M").rstrip(".")
    # Try exact match first, then strip common broker suffixes
    return PIP_SIZES.get(clean, PIP_SIZES.get(symbol.upper(), DEFAULT_PIP_SIZE))


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class TradeRow:
    """A single completed round-trip trade ready to insert into Supabase."""
    position_id:      int
    ticket:           int | None       # exit deal ticket
    symbol:           str
    direction:        str              # "buy" | "sell"
    lot_size:         float
    open_price:       float | None
    close_price:      float | None
    sl:               float | None
    tp:               float | None
    open_time:        str | None       # ISO-8601
    close_time:       str | None       # ISO-8601
    duration_minutes: int | None
    pnl:              float            # gross profit from MT5
    pnl_pips:         float | None
    commission:       float
    swap:             float
    net_pnl:          float            # pnl + commission + swap


# ---------------------------------------------------------------------------
# Core normalizer
# ---------------------------------------------------------------------------

ENTRY_IN  = 0   # mt5.DEAL_ENTRY_IN
ENTRY_OUT = 1   # mt5.DEAL_ENTRY_OUT

# MT5 deal type: 0 = buy, 1 = sell
DIRECTION_MAP: dict[int, str] = {0: "buy", 1: "sell"}


def _parse_time(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _duration_minutes(open_iso: str, close_iso: str) -> int:
    delta = _parse_time(close_iso) - _parse_time(open_iso)
    return max(0, int(delta.total_seconds() / 60))


def _pips(open_price: float, close_price: float, direction: str, symbol: str) -> float:
    pip = get_pip_size(symbol)
    raw = (close_price - open_price) / pip
    return round(raw if direction == "buy" else -raw, 1)


def normalize_deals(deals: list[dict[str, Any]]) -> list[TradeRow]:
    """
    Convert a flat list of MT5 deal dicts (from /history) into TradeRows.

    Pairs IN deals with OUT deals by position_id.
    Deals with no matching pair are still included with None for unknown fields
    (e.g. if history only goes back partway and the entry deal is missing).
    """
    # Group by position_id
    by_position: dict[int, dict[str, Any | None]] = {}

    for deal in deals:
        pid = deal.get("position_id") or deal.get("ticket")
        if pid not in by_position:
            by_position[pid] = {"in": None, "out": None}

        entry = deal.get("entry", -1)
        if entry == ENTRY_IN:
            by_position[pid]["in"] = deal
        elif entry == ENTRY_OUT:
            # Keep only the last OUT deal (handles partial closes naively)
            by_position[pid]["out"] = deal

    rows: list[TradeRow] = []

    for pid, pair in by_position.items():
        out_deal = pair["out"]
        in_deal  = pair["in"]

        # Skip positions that never closed (still open — covered by /trades)
        if out_deal is None:
            continue

        # Direction comes from the exit deal type (opposite of entry on a closing deal)
        # MT5 exit deal type: 1 = sell (closing a buy), 0 = buy (closing a sell)
        # So the position direction is the opposite of the exit deal type
        exit_type = out_deal.get("type", 0)
        direction = "buy" if exit_type == 1 else "sell"

        open_price  = in_deal["price"] if in_deal else None
        close_price = out_deal.get("price")
        open_time   = in_deal["time"]  if in_deal else None
        close_time  = out_deal.get("time")

        sl = in_deal.get("sl") if in_deal else None
        tp = in_deal.get("tp") if in_deal else None

        duration = (
            _duration_minutes(open_time, close_time)
            if open_time and close_time
            else None
        )

        pnl        = float(out_deal.get("profit", 0))
        commission = float(out_deal.get("commission", 0)) + (
            float(in_deal.get("commission", 0)) if in_deal else 0.0
        )
        swap = float(out_deal.get("swap", 0)) + (
            float(in_deal.get("swap", 0)) if in_deal else 0.0
        )
        net_pnl = pnl + commission + swap

        pnl_pips = (
            _pips(open_price, close_price, direction, out_deal.get("symbol", ""))
            if open_price is not None and close_price is not None
            else None
        )

        rows.append(
            TradeRow(
                position_id      = int(pid),
                ticket           = out_deal.get("ticket"),
                symbol           = out_deal.get("symbol", ""),
                direction        = direction,
                lot_size         = float(out_deal.get("lot_size", 0)),
                open_price       = open_price,
                close_price      = close_price,
                sl               = sl if sl else None,
                tp               = tp if tp else None,
                open_time        = open_time,
                close_time       = close_time,
                duration_minutes = duration,
                pnl              = pnl,
                pnl_pips         = pnl_pips,
                commission       = commission,
                swap             = swap,
                net_pnl          = net_pnl,
            )
        )

    # Sort by close_time ascending
    rows.sort(key=lambda r: r.close_time or "")
    return rows


def trade_row_to_dict(row: TradeRow, account_id: str) -> dict[str, Any]:
    """Serialize a TradeRow to a dict ready for Supabase upsert."""
    return {
        "account_id":       account_id,
        "position_id":      row.position_id,
        "ticket":           row.ticket,
        "symbol":           row.symbol,
        "direction":        row.direction,
        "lot_size":         row.lot_size,
        "open_price":       row.open_price,
        "close_price":      row.close_price,
        "sl":               row.sl,
        "tp":               row.tp,
        "open_time":        row.open_time,
        "close_time":       row.close_time,
        "duration_minutes": row.duration_minutes,
        "pnl":              row.pnl,
        "pnl_pips":         row.pnl_pips,
        "commission":       row.commission,
        "swap":             row.swap,
        "net_pnl":          row.net_pnl,
    }
