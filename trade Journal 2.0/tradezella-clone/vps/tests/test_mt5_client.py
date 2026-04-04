"""
tests/test_mt5_client.py — Unit tests for mt5_client.py.

All tests mock the MetaTrader5 library so they run on any OS (Mac, Linux, CI)
without a real MT5 terminal.  The mock reproduces the named-tuple structure
that MT5 returns, letting us verify every conversion function in isolation.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Stub out the MetaTrader5 import before importing mt5_client
# ---------------------------------------------------------------------------
# MT5 is Windows-only, so we create a fake module so the test can run anywhere.
_mt5_stub = MagicMock()
_mt5_stub.DEAL_ENTRY_IN = 0
_mt5_stub.DEAL_ENTRY_OUT = 1
_mt5_stub.DEAL_ENTRY_INOUT = 2
sys.modules.setdefault("MetaTrader5", _mt5_stub)

# Now we can safely import the module under test
import mt5_client  # noqa: E402  (import after sys.modules patch)

# Patch MT5_AVAILABLE so all code paths that check it see True
mt5_client.MT5_AVAILABLE = True
mt5_client.mt5 = _mt5_stub


# ---------------------------------------------------------------------------
# Helper factories for MT5 named-tuple stubs
# ---------------------------------------------------------------------------

def _make_position(
    ticket: int = 100001,
    symbol: str = "EURUSD",
    type_: int = 0,          # 0 = BUY
    volume: float = 0.10,
    price_open: float = 1.08500,
    price_current: float = 1.08650,
    sl: float = 1.08200,
    tp: float = 1.09000,
    time: int = 1_700_000_000,  # Unix timestamp
    swap: float = -0.50,
    profit: float = 15.00,
    comment: str = "",
    magic: int = 0,
) -> SimpleNamespace:
    return SimpleNamespace(
        ticket=ticket,
        symbol=symbol,
        type=type_,
        volume=volume,
        price_open=price_open,
        price_current=price_current,
        sl=sl,
        tp=tp,
        time=time,
        swap=swap,
        profit=profit,
        comment=comment,
        magic=magic,
    )


def _make_deal(
    ticket: int = 200001,
    order: int = 300001,
    position_id: int = 100001,
    symbol: str = "EURUSD",
    type_: int = 1,          # 1 = SELL (exit deal on a BUY position)
    volume: float = 0.10,
    price: float = 1.08650,
    time: int = 1_700_003_600,
    commission: float = -0.70,
    swap: float = -0.50,
    profit: float = 15.00,
    comment: str = "",
    magic: int = 0,
    entry: int = 1,          # 1 = DEAL_ENTRY_OUT (closing deal)
) -> SimpleNamespace:
    # Note: real MT5 TradeDeal objects do not have sl/tp fields
    return SimpleNamespace(
        ticket=ticket,
        order=order,
        position_id=position_id,
        symbol=symbol,
        type=type_,
        volume=volume,
        price=price,
        time=time,
        commission=commission,
        swap=swap,
        profit=profit,
        comment=comment,
        magic=magic,
        entry=entry,
    )


# ---------------------------------------------------------------------------
# _position_to_dict
# ---------------------------------------------------------------------------

class TestPositionToDict:
    def test_buy_direction(self) -> None:
        pos = _make_position(type_=0)
        result = mt5_client._position_to_dict(pos)
        assert result["direction"] == "buy"

    def test_sell_direction(self) -> None:
        pos = _make_position(type_=1)
        result = mt5_client._position_to_dict(pos)
        assert result["direction"] == "sell"

    def test_timestamp_is_iso_utc(self) -> None:
        unix_ts = 1_700_000_000
        pos = _make_position(time=unix_ts)
        result = mt5_client._position_to_dict(pos)
        expected = datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()
        assert result["open_time"] == expected

    def test_status_is_open(self) -> None:
        pos = _make_position()
        result = mt5_client._position_to_dict(pos)
        assert result["status"] == "open"

    def test_all_expected_keys_present(self) -> None:
        pos = _make_position()
        result = mt5_client._position_to_dict(pos)
        required_keys = {
            "ticket", "symbol", "direction", "lot_size", "open_price",
            "current_price", "sl", "tp", "open_time", "swap", "profit",
            "comment", "magic", "status",
        }
        assert required_keys <= set(result.keys())

    def test_numeric_values_preserved(self) -> None:
        pos = _make_position(volume=0.10, price_open=1.08500, profit=15.00)
        result = mt5_client._position_to_dict(pos)
        assert result["lot_size"] == 0.10
        assert result["open_price"] == 1.08500
        assert result["profit"] == 15.00


# ---------------------------------------------------------------------------
# _deal_to_dict
# ---------------------------------------------------------------------------

class TestDealToDict:
    def test_entry_field_preserved(self) -> None:
        deal = _make_deal(entry=1)
        result = mt5_client._deal_to_dict(deal)
        assert result["entry"] == 1

    def test_timestamp_is_iso_utc(self) -> None:
        unix_ts = 1_700_003_600
        deal = _make_deal(time=unix_ts)
        result = mt5_client._deal_to_dict(deal)
        expected = datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()
        assert result["time"] == expected

    def test_all_expected_keys_present(self) -> None:
        deal = _make_deal()
        result = mt5_client._deal_to_dict(deal)
        required_keys = {
            "ticket", "order", "position_id", "symbol", "direction",
            "lot_size", "price", "time", "commission",
            "swap", "profit", "comment", "magic", "entry",
        }
        assert required_keys <= set(result.keys())

    def test_direction_sell(self) -> None:
        deal = _make_deal(type_=1)
        result = mt5_client._deal_to_dict(deal)
        assert result["direction"] == "sell"


# ---------------------------------------------------------------------------
# get_open_positions
# ---------------------------------------------------------------------------

class TestGetOpenPositions:
    def test_returns_list_of_dicts(self) -> None:
        _mt5_stub.positions_get.return_value = [_make_position()]
        result = mt5_client.get_open_positions()
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["ticket"] == 100001

    def test_returns_empty_list_when_none(self) -> None:
        """MT5 returns None (not []) when there are no open positions."""
        _mt5_stub.positions_get.return_value = None
        result = mt5_client.get_open_positions()
        assert result == []

    def test_multiple_positions(self) -> None:
        positions = [_make_position(ticket=i) for i in range(1, 4)]
        _mt5_stub.positions_get.return_value = positions
        result = mt5_client.get_open_positions()
        assert len(result) == 3
        tickets = {r["ticket"] for r in result}
        assert tickets == {1, 2, 3}


# ---------------------------------------------------------------------------
# get_recent_deals
# ---------------------------------------------------------------------------

class TestGetRecentDeals:
    def test_filters_out_entry_deals(self) -> None:
        """Only DEAL_ENTRY_OUT (entry=1) deals should be returned."""
        entry_deal = _make_deal(entry=0)   # opening deal — should be excluded
        exit_deal = _make_deal(entry=1)    # closing deal — should be included
        _mt5_stub.history_deals_get.return_value = [entry_deal, exit_deal]
        _mt5_stub.DEAL_ENTRY_OUT = 1

        result = mt5_client.get_recent_deals(lookback_hours=24)
        assert len(result) == 1
        assert result[0]["entry"] == 1

    def test_returns_empty_list_when_none(self) -> None:
        _mt5_stub.history_deals_get.return_value = None
        result = mt5_client.get_recent_deals()
        assert result == []

    def test_passes_correct_time_window(self) -> None:
        """history_deals_get should be called with two datetime args."""
        _mt5_stub.history_deals_get.return_value = []
        mt5_client.get_recent_deals(lookback_hours=6)
        args, _ = _mt5_stub.history_deals_get.call_args
        from_dt, to_dt = args
        assert isinstance(from_dt, datetime)
        assert isinstance(to_dt, datetime)
        # The window should be approximately 6 hours
        delta_hours = (to_dt - from_dt).total_seconds() / 3600
        assert 5.9 < delta_hours < 6.1


# ---------------------------------------------------------------------------
# get_full_history
# ---------------------------------------------------------------------------

class TestGetFullHistory:
    def test_returns_all_deals(self) -> None:
        deals = [_make_deal(entry=e) for e in (0, 1, 2)]
        _mt5_stub.history_deals_get.return_value = deals
        result = mt5_client.get_full_history()
        # All deal types returned (not filtered like get_recent_deals)
        assert len(result) == 3

    def test_returns_empty_list_when_none(self) -> None:
        _mt5_stub.history_deals_get.return_value = None
        result = mt5_client.get_full_history()
        assert result == []

    def test_custom_date_range_passed_to_mt5(self) -> None:
        _mt5_stub.history_deals_get.return_value = []
        from_dt = datetime(2024, 1, 1, tzinfo=timezone.utc)
        to_dt = datetime(2024, 6, 1, tzinfo=timezone.utc)
        mt5_client.get_full_history(from_dt=from_dt, to_dt=to_dt)
        args, _ = _mt5_stub.history_deals_get.call_args
        assert args[0] == from_dt
        assert args[1] == to_dt

    def test_default_from_is_year_2000(self) -> None:
        _mt5_stub.history_deals_get.return_value = []
        mt5_client.get_full_history()
        args, _ = _mt5_stub.history_deals_get.call_args
        assert args[0] == datetime(2000, 1, 1, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# get_account_info
# ---------------------------------------------------------------------------

class TestGetAccountInfo:
    def _make_account_info(self) -> SimpleNamespace:
        return SimpleNamespace(
            login=12345678,
            name="Test Account",
            server="DemoServer-MT5",
            currency="USD",
            balance=10_000.00,
            equity=10_150.00,
            margin=500.00,
            margin_free=9_650.00,
            leverage=100,
        )

    def test_returns_dict_with_expected_keys(self) -> None:
        _mt5_stub.account_info.return_value = self._make_account_info()
        result = mt5_client.get_account_info()
        assert result is not None
        assert result["currency"] == "USD"
        assert result["balance"] == 10_000.00
        assert result["leverage"] == 100

    def test_returns_none_when_mt5_returns_none(self) -> None:
        _mt5_stub.account_info.return_value = None
        result = mt5_client.get_account_info()
        assert result is None
