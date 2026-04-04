"""
mt5_client.py — MetaTrader 5 connection and data extraction.

MT5 quirks documented inline:
- MT5 only runs on Windows; the MetaTrader5 Python lib talks to a locally running terminal.
- "Positions" = currently open trades.
- "Deals" = individual fill events (entries and exits). A round-trip trade = 2 deals.
- "Orders" = pending/historical order records (not the same as deals).
- Timestamps from MT5 are Unix seconds (int), not datetime objects.
- Volume in MT5 = lot size (0.01 lots = 1 micro lot).
- Position type: 0 = BUY, 1 = SELL (use the constants mt5.ORDER_TYPE_BUY / SELL).
- history_deals_get() includes both entry and exit deals; filter by entry field.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

try:
    import MetaTrader5 as mt5  # only available on Windows with MT5 terminal installed
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None  # type: ignore[assignment]
    MT5_AVAILABLE = False

logger = logging.getLogger(__name__)

# MT5 deal entry types
# mt5.DEAL_ENTRY_IN  = 0 — opening a position
# mt5.DEAL_ENTRY_OUT = 1 — closing a position
# mt5.DEAL_ENTRY_INOUT = 2 — reversal

DIRECTION_MAP: dict[int, str] = {0: "buy", 1: "sell"}


def _require_mt5() -> None:
    """Raise RuntimeError if the MetaTrader5 library is not available."""
    if not MT5_AVAILABLE:
        raise RuntimeError(
            "MetaTrader5 Python library is not installed. "
            "Install it with: pip install MetaTrader5"
        )


def initialize(
    login: int | None = None,
    password: str | None = None,
    server: str | None = None,
) -> bool:
    """
    Connect to the locally running MT5 terminal.

    Called with no arguments on server startup — connects to whichever account
    the MT5 terminal is already logged into.

    Called with login/password/server to switch to a specific account.
    Always use the investor (read-only) password, never the master password.

    Returns True on success, False on failure.
    """
    _require_mt5()

    kwargs: dict = {}
    if login is not None:
        kwargs["login"] = login
    if password is not None:
        kwargs["password"] = password
    if server is not None:
        kwargs["server"] = server

    if not mt5.initialize(**kwargs):
        error = mt5.last_error()
        logger.error("MT5 initialize() failed: %s", error)
        return False

    info = mt5.terminal_info()
    logger.info(
        "MT5 connected — build %s, connected=%s",
        info.build if info else "?",
        info.connected if info else "?",
    )
    return True


def shutdown() -> None:
    """Disconnect from the MT5 terminal."""
    if MT5_AVAILABLE and mt5:
        mt5.shutdown()
        logger.info("MT5 disconnected")


def _position_to_dict(pos: Any) -> dict[str, Any]:
    """Convert a MT5 TradePosition named-tuple to a plain dict."""
    return {
        "ticket": pos.ticket,
        "symbol": pos.symbol,
        # MT5 type 0 = BUY, 1 = SELL
        "direction": DIRECTION_MAP.get(pos.type, str(pos.type)),
        "lot_size": pos.volume,
        "open_price": pos.price_open,
        "current_price": pos.price_current,
        "sl": pos.sl,
        "tp": pos.tp,
        # MT5 timestamps are Unix seconds (int) — convert to ISO-8601 UTC
        "open_time": datetime.fromtimestamp(pos.time, tz=timezone.utc).isoformat(),
        "swap": pos.swap,
        "profit": pos.profit,
        "comment": pos.comment,
        "magic": pos.magic,
        "status": "open",
    }


def _deal_to_dict(deal: Any) -> dict[str, Any]:
    """Convert a MT5 TradeDeal named-tuple to a plain dict."""
    return {
        "ticket": deal.ticket,
        "order": deal.order,
        "position_id": deal.position_id,
        "symbol": deal.symbol,
        "direction": DIRECTION_MAP.get(deal.type, str(deal.type)),
        "lot_size": deal.volume,
        "price": deal.price,
        # Note: TradeDeal objects do not have sl/tp fields (those are on positions/orders)
        "time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
        "commission": deal.commission,
        "swap": deal.swap,
        "profit": deal.profit,
        "comment": deal.comment,
        "magic": deal.magic,
        # entry: 0=IN (open), 1=OUT (close), 2=INOUT (reversal)
        "entry": deal.entry,
    }


def get_open_positions() -> list[dict[str, Any]]:
    """
    Return all currently open positions as a list of dicts.
    Returns an empty list if MT5 returns None (no open trades).
    """
    _require_mt5()
    positions = mt5.positions_get()
    if positions is None:
        # MT5 returns None (not an empty tuple) when there are no open positions.
        logger.debug("No open positions (mt5.positions_get() returned None)")
        return []
    return [_position_to_dict(p) for p in positions]


def get_recent_deals(lookback_hours: int = 24) -> list[dict[str, Any]]:
    """
    Return deals closed within the last `lookback_hours` hours.

    MT5 deal history requires explicit from/to datetime objects.
    We only return EXIT deals (entry == DEAL_ENTRY_OUT) so the caller gets
    completed round-trip records, not raw fill events.
    """
    _require_mt5()
    from_dt = datetime.fromtimestamp(
        datetime.now(tz=timezone.utc).timestamp() - lookback_hours * 3600,
        tz=timezone.utc,
    )
    to_dt = datetime.now(tz=timezone.utc)

    # MT5 requires naive (timezone-unaware) UTC datetimes
    deals = mt5.history_deals_get(from_dt.replace(tzinfo=None), to_dt.replace(tzinfo=None))
    if deals is None:
        logger.debug("No deals in the last %d hours", lookback_hours)
        return []

    # DEAL_ENTRY_OUT = 1: the deal that closes a position
    closing_deals = [d for d in deals if d.entry == mt5.DEAL_ENTRY_OUT]
    return [_deal_to_dict(d) for d in closing_deals]


def get_full_history(
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
) -> list[dict[str, Any]]:
    """
    Return the full deal history between from_dt and to_dt.

    Defaults to all available history (2000-01-01 → now) when not specified.
    Returns ALL deals (both IN and OUT) so the caller can reconstruct full
    position lifecycles if needed.
    """
    _require_mt5()
    if from_dt is None:
        from_dt = datetime(2000, 1, 1, tzinfo=timezone.utc)
    if to_dt is None:
        to_dt = datetime.now(tz=timezone.utc)

    # MT5 requires naive (timezone-unaware) UTC datetimes
    deals = mt5.history_deals_get(from_dt.replace(tzinfo=None), to_dt.replace(tzinfo=None))
    if deals is None:
        logger.debug("No historical deals found")
        return []

    return [_deal_to_dict(d) for d in deals]


def get_account_info() -> dict[str, Any] | None:
    """Return basic account info (balance, equity, currency) for debugging."""
    _require_mt5()
    info = mt5.account_info()
    if info is None:
        logger.warning("mt5.account_info() returned None")
        return None
    return {
        "login": info.login,
        "name": info.name,
        "server": info.server,
        "currency": info.currency,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "margin_free": info.margin_free,
        "leverage": info.leverage,
    }
