"""
tests/test_normalizer.py — Unit tests for mac/normalizer.py.

All tests use synthetic deal data so no VPS or Supabase connection is needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from normalizer import normalize_deals, trade_row_to_dict, get_pip_size, _pips


# ---------------------------------------------------------------------------
# Sample deal factories
# ---------------------------------------------------------------------------

def _in_deal(
    position_id: int = 1001,
    ticket: int = 2001,
    symbol: str = "EURUSD",
    type_: int = 0,        # 0 = buy entry
    volume: float = 0.10,
    price: float = 1.08500,
    time: str = "2024-06-01T09:00:00+00:00",
    commission: float = -0.70,
    swap: float = 0.0,
    profit: float = 0.0,
) -> dict:
    return {
        "ticket": ticket, "position_id": position_id,
        "symbol": symbol, "direction": "buy" if type_ == 0 else "sell",
        "type": type_, "lot_size": volume, "price": price,
        "time": time, "commission": commission, "swap": swap,
        "profit": profit, "entry": 0,
    }


def _out_deal(
    position_id: int = 1001,
    ticket: int = 3001,
    symbol: str = "EURUSD",
    type_: int = 1,        # 1 = sell (closing a buy)
    volume: float = 0.10,
    price: float = 1.08700,
    time: str = "2024-06-01T10:30:00+00:00",
    commission: float = -0.70,
    swap: float = -0.50,
    profit: float = 20.00,
) -> dict:
    return {
        "ticket": ticket, "position_id": position_id,
        "symbol": symbol, "direction": "sell" if type_ == 1 else "buy",
        "type": type_, "lot_size": volume, "price": price,
        "time": time, "commission": commission, "swap": swap,
        "profit": profit, "entry": 1,
    }


# ---------------------------------------------------------------------------
# get_pip_size
# ---------------------------------------------------------------------------

class TestGetPipSize:
    def test_eurusd(self):
        assert get_pip_size("EURUSD") == 0.0001

    def test_usdjpy(self):
        assert get_pip_size("USDJPY") == 0.01

    def test_xauusd(self):
        assert get_pip_size("XAUUSD") == 0.1

    def test_unknown_symbol_returns_default(self):
        assert get_pip_size("ZZZNOPE") == 0.0001

    def test_case_insensitive(self):
        assert get_pip_size("eurusd") == get_pip_size("EURUSD")


# ---------------------------------------------------------------------------
# _pips
# ---------------------------------------------------------------------------

class TestPips:
    def test_buy_profit_in_pips(self):
        result = _pips(1.08500, 1.08700, "buy", "EURUSD")
        assert abs(result - 20.0) < 0.01

    def test_buy_loss_in_pips(self):
        result = _pips(1.08500, 1.08300, "buy", "EURUSD")
        assert abs(result - (-20.0)) < 0.01

    def test_sell_profit_in_pips(self):
        # Sell: opened high, closed low = profit
        result = _pips(1.08500, 1.08300, "sell", "EURUSD")
        assert abs(result - 20.0) < 0.01

    def test_jpy_pair(self):
        result = _pips(150.000, 150.100, "buy", "USDJPY")
        assert abs(result - 10.0) < 0.01


# ---------------------------------------------------------------------------
# normalize_deals — core pairing logic
# ---------------------------------------------------------------------------

class TestNormalizeDeals:
    def test_single_round_trip(self):
        deals = [_in_deal(), _out_deal()]
        rows = normalize_deals(deals)
        assert len(rows) == 1

    def test_direction_is_buy_when_exit_type_is_sell(self):
        deals = [_in_deal(type_=0), _out_deal(type_=1)]
        rows = normalize_deals(deals)
        assert rows[0].direction == "buy"

    def test_direction_is_sell_when_exit_type_is_buy(self):
        # Sell position: entry type=1, exit type=0
        deals = [_in_deal(type_=1), _out_deal(type_=0)]
        rows = normalize_deals(deals)
        assert rows[0].direction == "sell"

    def test_open_price_from_entry_deal(self):
        deals = [_in_deal(price=1.08500), _out_deal(price=1.08700)]
        rows = normalize_deals(deals)
        assert rows[0].open_price == 1.08500

    def test_close_price_from_exit_deal(self):
        deals = [_in_deal(price=1.08500), _out_deal(price=1.08700)]
        rows = normalize_deals(deals)
        assert rows[0].close_price == 1.08700

    def test_pnl_from_exit_deal_profit(self):
        deals = [_in_deal(profit=0), _out_deal(profit=20.0)]
        rows = normalize_deals(deals)
        assert rows[0].pnl == 20.0

    def test_commission_summed_from_both_deals(self):
        deals = [_in_deal(commission=-0.70), _out_deal(commission=-0.70)]
        rows = normalize_deals(deals)
        assert abs(rows[0].commission - (-1.40)) < 0.001

    def test_net_pnl_includes_commission_and_swap(self):
        deals = [
            _in_deal(commission=-0.70, swap=0.0, profit=0.0),
            _out_deal(commission=-0.70, swap=-0.50, profit=20.0),
        ]
        rows = normalize_deals(deals)
        expected = 20.0 + (-0.70 + -0.70) + (-0.50)
        assert abs(rows[0].net_pnl - expected) < 0.001

    def test_duration_minutes_computed(self):
        deals = [
            _in_deal(time="2024-06-01T09:00:00+00:00"),
            _out_deal(time="2024-06-01T10:30:00+00:00"),
        ]
        rows = normalize_deals(deals)
        assert rows[0].duration_minutes == 90

    def test_pnl_pips_computed_for_buy(self):
        deals = [_in_deal(price=1.08500), _out_deal(price=1.08700)]
        rows = normalize_deals(deals)
        # (1.08700 - 1.08500) / 0.0001 = 20 pips
        assert abs(rows[0].pnl_pips - 20.0) < 0.1

    def test_no_entry_deal_still_produces_row(self):
        """Exit-only deals (missing entry) are still included with None open fields."""
        deals = [_out_deal()]  # no entry deal
        rows = normalize_deals(deals)
        assert len(rows) == 1
        assert rows[0].open_price is None
        assert rows[0].open_time is None

    def test_entry_only_deal_excluded(self):
        """Positions never closed (entry only) should NOT produce a row."""
        deals = [_in_deal()]  # no exit deal
        rows = normalize_deals(deals)
        assert len(rows) == 0

    def test_multiple_positions(self):
        deals = [
            _in_deal(position_id=1001, ticket=2001),
            _out_deal(position_id=1001, ticket=3001),
            _in_deal(position_id=1002, ticket=2002),
            _out_deal(position_id=1002, ticket=3002),
        ]
        rows = normalize_deals(deals)
        assert len(rows) == 2

    def test_sorted_by_close_time_ascending(self):
        deals = [
            _in_deal(position_id=1001, time="2024-06-01T08:00:00+00:00"),
            _out_deal(position_id=1001, time="2024-06-01T09:00:00+00:00"),
            _in_deal(position_id=1002, time="2024-06-01T10:00:00+00:00"),
            _out_deal(position_id=1002, time="2024-06-01T11:00:00+00:00"),
        ]
        rows = normalize_deals(deals)
        assert rows[0].close_time < rows[1].close_time

    def test_empty_input(self):
        assert normalize_deals([]) == []

    def test_position_id_set_correctly(self):
        deals = [_in_deal(position_id=9999), _out_deal(position_id=9999)]
        rows = normalize_deals(deals)
        assert rows[0].position_id == 9999

    def test_ticket_is_exit_deal_ticket(self):
        deals = [_in_deal(ticket=2001), _out_deal(ticket=3001)]
        rows = normalize_deals(deals)
        assert rows[0].ticket == 3001


# ---------------------------------------------------------------------------
# trade_row_to_dict
# ---------------------------------------------------------------------------

class TestTradeRowToDict:
    def _make_row(self):
        deals = [_in_deal(), _out_deal()]
        return normalize_deals(deals)[0]

    def test_returns_dict(self):
        row = self._make_row()
        result = trade_row_to_dict(row, "test-uuid")
        assert isinstance(result, dict)

    def test_account_id_injected(self):
        row = self._make_row()
        result = trade_row_to_dict(row, "abc-123")
        assert result["account_id"] == "abc-123"

    def test_all_expected_keys_present(self):
        row = self._make_row()
        result = trade_row_to_dict(row, "abc-123")
        required = {
            "account_id", "position_id", "ticket", "symbol", "direction",
            "lot_size", "open_price", "close_price", "sl", "tp",
            "open_time", "close_time", "duration_minutes",
            "pnl", "pnl_pips", "commission", "swap", "net_pnl",
        }
        assert required <= set(result.keys())
