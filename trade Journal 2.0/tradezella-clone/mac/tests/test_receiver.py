"""
tests/test_receiver.py — Unit tests for mac/receiver.py.

Uses respx to mock httpx so no real network calls are made.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
import respx

# Make receiver importable (it lives one level up from tests/)
sys.path.insert(0, str(Path(__file__).parent.parent))
import receiver


# ---------------------------------------------------------------------------
# Sample API responses
# ---------------------------------------------------------------------------

_HEALTH_OK = {
    "status": "ok",
    "mt5_connected": True,
    "server_time_utc": "2024-11-14T10:00:00+00:00",
}

_HEALTH_NO_MT5 = {
    "status": "ok",
    "mt5_connected": False,
    "server_time_utc": "2024-11-14T10:00:00+00:00",
}

_TRADES_RESPONSE = {
    "open_positions": [
        {
            "ticket": 100001,
            "symbol": "EURUSD",
            "direction": "buy",
            "lot_size": 0.10,
            "open_price": 1.08500,
            "current_price": 1.08650,
            "sl": 1.08200,
            "tp": 1.09000,
            "open_time": "2024-11-14T10:13:20+00:00",
            "swap": -0.50,
            "profit": 15.00,
            "comment": "",
            "magic": 0,
            "status": "open",
        }
    ],
    "recent_deals": [
        {
            "ticket": 200001,
            "order": 300001,
            "position_id": 100001,
            "symbol": "GBPUSD",
            "direction": "sell",
            "lot_size": 0.05,
            "price": 1.26500,
            "sl": 0.0,
            "tp": 0.0,
            "time": "2024-11-14T09:00:00+00:00",
            "commission": -0.35,
            "swap": -0.25,
            "profit": 8.50,
            "comment": "",
            "magic": 0,
            "entry": 1,
        }
    ],
    "meta": {
        "open_count": 1,
        "recent_deals_count": 1,
        "lookback_hours": 24,
        "fetched_at_utc": "2024-11-14T10:14:00+00:00",
    },
}

_HISTORY_RESPONSE = {
    "deals": [
        {
            "ticket": 200001,
            "entry": 1,
            "profit": 8.50,
        }
    ],
    "meta": {
        "count": 1,
        "from_date": None,
        "to_date": "2024-11-14T10:00:00+00:00",
        "fetched_at_utc": "2024-11-14T10:14:00+00:00",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VPS_BASE = "http://79.108.225.44:8000"


def _mock_url(path: str) -> str:
    return f"{VPS_BASE}{path}"


# ---------------------------------------------------------------------------
# Tests: _get()
# ---------------------------------------------------------------------------

class TestGet:
    @respx.mock
    def test_returns_parsed_json(self) -> None:
        respx.get(_mock_url("/health")).mock(
            return_value=httpx.Response(200, json=_HEALTH_OK)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            result = receiver._get("/health")
        assert result["status"] == "ok"

    @respx.mock
    def test_raises_system_exit_on_404(self) -> None:
        respx.get(_mock_url("/health")).mock(
            return_value=httpx.Response(404, json={"detail": "not found"})
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            with pytest.raises(SystemExit):
                receiver._get("/health")

    @respx.mock
    def test_raises_system_exit_on_connection_error(self) -> None:
        respx.get(_mock_url("/health")).mock(side_effect=httpx.ConnectError("refused"))
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            with pytest.raises(SystemExit):
                receiver._get("/health")

    @respx.mock
    def test_sends_api_key_header_when_set(self) -> None:
        route = respx.get(_mock_url("/health")).mock(
            return_value=httpx.Response(200, json=_HEALTH_OK)
        )
        with (
            patch.object(receiver, "VPS_URL", VPS_BASE),
            patch.object(receiver, "_HEADERS", {"X-API-Key": "secret123"}),
        ):
            receiver._get("/health")
        request = route.calls.last.request
        assert request.headers.get("x-api-key") == "secret123"


# ---------------------------------------------------------------------------
# Tests: fetch_health()
# ---------------------------------------------------------------------------

class TestFetchHealth:
    @respx.mock
    def test_prints_json_to_stdout(self, capsys: pytest.CaptureFixture) -> None:
        respx.get(_mock_url("/health")).mock(
            return_value=httpx.Response(200, json=_HEALTH_OK)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            receiver.fetch_health()
        out = capsys.readouterr().out
        assert "HEALTH CHECK" in out
        assert "mt5_connected" in out

    @respx.mock
    def test_warns_when_mt5_not_connected(self, capsys: pytest.CaptureFixture) -> None:
        respx.get(_mock_url("/health")).mock(
            return_value=httpx.Response(200, json=_HEALTH_NO_MT5)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            receiver.fetch_health()
        err = capsys.readouterr().err
        assert "WARNING" in err


# ---------------------------------------------------------------------------
# Tests: fetch_trades()
# ---------------------------------------------------------------------------

class TestFetchTrades:
    @respx.mock
    def test_returns_response_dict(self) -> None:
        respx.get(_mock_url("/trades")).mock(
            return_value=httpx.Response(200, json=_TRADES_RESPONSE)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            result = receiver.fetch_trades()
        assert "open_positions" in result
        assert "recent_deals" in result

    @respx.mock
    def test_prints_summary(self, capsys: pytest.CaptureFixture) -> None:
        respx.get(_mock_url("/trades")).mock(
            return_value=httpx.Response(200, json=_TRADES_RESPONSE)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            receiver.fetch_trades()
        out = capsys.readouterr().out
        assert "Open positions" in out
        assert "EURUSD" in out

    @respx.mock
    def test_passes_lookback_hours_as_param(self) -> None:
        route = respx.get(_mock_url("/trades")).mock(
            return_value=httpx.Response(200, json=_TRADES_RESPONSE)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            receiver.fetch_trades(lookback_hours=48)
        request = route.calls.last.request
        assert "lookback_hours=48" in str(request.url)


# ---------------------------------------------------------------------------
# Tests: fetch_history()
# ---------------------------------------------------------------------------

class TestFetchHistory:
    @respx.mock
    def test_returns_response_dict(self) -> None:
        respx.get(_mock_url("/history")).mock(
            return_value=httpx.Response(200, json=_HISTORY_RESPONSE)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            result = receiver.fetch_history()
        assert "deals" in result
        assert result["meta"]["count"] == 1

    @respx.mock
    def test_passes_from_date_param(self) -> None:
        route = respx.get(_mock_url("/history")).mock(
            return_value=httpx.Response(200, json=_HISTORY_RESPONSE)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            receiver.fetch_history(from_date="2024-01-01")
        request = route.calls.last.request
        assert "from_date=2024-01-01" in str(request.url)

    @respx.mock
    def test_no_from_date_sends_no_param(self) -> None:
        route = respx.get(_mock_url("/history")).mock(
            return_value=httpx.Response(200, json=_HISTORY_RESPONSE)
        )
        with patch.object(receiver, "VPS_URL", VPS_BASE):
            receiver.fetch_history()
        request = route.calls.last.request
        assert "from_date" not in str(request.url)
