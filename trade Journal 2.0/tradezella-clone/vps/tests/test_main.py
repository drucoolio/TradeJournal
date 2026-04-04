"""
tests/test_main.py — Integration tests for the FastAPI endpoints in main.py.

Uses FastAPI's TestClient (backed by httpx) so no real server is needed.
All MT5 calls are mocked — these tests verify routing, response shapes,
query-param parsing, and error handling only.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Stub MetaTrader5 before importing main (same technique as test_mt5_client)
# ---------------------------------------------------------------------------
_mt5_stub = MagicMock()
_mt5_stub.DEAL_ENTRY_IN = 0
_mt5_stub.DEAL_ENTRY_OUT = 1
_mt5_stub.DEAL_ENTRY_INOUT = 2
sys.modules.setdefault("MetaTrader5", _mt5_stub)

import mt5_client  # noqa: E402
mt5_client.MT5_AVAILABLE = True
mt5_client.mt5 = _mt5_stub

# Patch initialize / shutdown so TestClient lifespan doesn't hit real MT5
_mt5_stub.initialize.return_value = True
_mt5_stub.shutdown.return_value = None

# Now import the app
import main  # noqa: E402

# Force mt5_connected = True for all tests
main.app.state.mt5_connected = True


@pytest.fixture()
def client() -> TestClient:
    """Return a TestClient with MT5 marked as connected."""
    with TestClient(main.app, raise_server_exceptions=True) as c:
        main.app.state.mt5_connected = True
        yield c


# ---------------------------------------------------------------------------
# Sample data helpers
# ---------------------------------------------------------------------------

def _open_position() -> dict:
    return {
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


def _closed_deal() -> dict:
    return {
        "ticket": 200001,
        "order": 300001,
        "position_id": 100001,
        "symbol": "EURUSD",
        "direction": "sell",
        "lot_size": 0.10,
        "price": 1.08650,
        "sl": 0.0,
        "tp": 0.0,
        "time": "2024-11-14T11:13:20+00:00",
        "commission": -0.70,
        "swap": -0.50,
        "profit": 15.00,
        "comment": "",
        "magic": 0,
        "entry": 1,
    }


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_returns_200(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_body_has_expected_keys(self, client: TestClient) -> None:
        body = client.get("/health").json()
        assert "status" in body
        assert "mt5_connected" in body
        assert "server_time_utc" in body

    def test_status_is_ok(self, client: TestClient) -> None:
        body = client.get("/health").json()
        assert body["status"] == "ok"


# ---------------------------------------------------------------------------
# /trades
# ---------------------------------------------------------------------------

class TestTrades:
    def test_returns_200(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "get_open_positions", return_value=[_open_position()]),
            patch.object(mt5_client, "get_recent_deals", return_value=[_closed_deal()]),
        ):
            resp = client.get("/trades")
        assert resp.status_code == 200

    def test_response_shape(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "get_open_positions", return_value=[_open_position()]),
            patch.object(mt5_client, "get_recent_deals", return_value=[_closed_deal()]),
        ):
            body = client.get("/trades").json()
        assert "open_positions" in body
        assert "recent_deals" in body
        assert "meta" in body

    def test_meta_counts_match(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "get_open_positions", return_value=[_open_position()]),
            patch.object(mt5_client, "get_recent_deals", return_value=[_closed_deal(), _closed_deal()]),
        ):
            body = client.get("/trades").json()
        assert body["meta"]["open_count"] == 1
        assert body["meta"]["recent_deals_count"] == 2

    def test_lookback_hours_default_is_24(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "get_open_positions", return_value=[]),
            patch.object(mt5_client, "get_recent_deals", return_value=[]) as mock_recent,
        ):
            client.get("/trades")
        mock_recent.assert_called_once_with(lookback_hours=24)

    def test_lookback_hours_custom(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "get_open_positions", return_value=[]),
            patch.object(mt5_client, "get_recent_deals", return_value=[]) as mock_recent,
        ):
            client.get("/trades?lookback_hours=48")
        mock_recent.assert_called_once_with(lookback_hours=48)

    def test_lookback_hours_too_large_returns_422(self, client: TestClient) -> None:
        resp = client.get("/trades?lookback_hours=999")
        assert resp.status_code == 422

    def test_lookback_hours_zero_returns_422(self, client: TestClient) -> None:
        resp = client.get("/trades?lookback_hours=0")
        assert resp.status_code == 422

    def test_503_when_mt5_not_connected(self, client: TestClient) -> None:
        main.app.state.mt5_connected = False
        try:
            resp = client.get("/trades")
            assert resp.status_code == 503
        finally:
            main.app.state.mt5_connected = True


# ---------------------------------------------------------------------------
# /history
# ---------------------------------------------------------------------------

class TestHistory:
    def test_returns_200_no_params(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_full_history", return_value=[_closed_deal()]):
            resp = client.get("/history")
        assert resp.status_code == 200

    def test_response_shape(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_full_history", return_value=[_closed_deal()]):
            body = client.get("/history").json()
        assert "deals" in body
        assert "meta" in body
        assert body["meta"]["count"] == 1

    def test_from_date_parsed_correctly(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_full_history", return_value=[]) as mock_hist:
            client.get("/history?from_date=2024-01-01")
        args, kwargs = mock_hist.call_args
        from_dt = kwargs.get("from_dt") or args[0]
        assert from_dt.year == 2024
        assert from_dt.month == 1
        assert from_dt.day == 1

    def test_invalid_date_returns_422(self, client: TestClient) -> None:
        resp = client.get("/history?from_date=not-a-date")
        assert resp.status_code == 422

    def test_date_range_both_params(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_full_history", return_value=[]) as mock_hist:
            client.get("/history?from_date=2024-01-01&to_date=2024-06-01")
        args, kwargs = mock_hist.call_args
        from_dt = kwargs.get("from_dt") or args[0]
        to_dt = kwargs.get("to_dt") or args[1]
        assert from_dt < to_dt

    def test_503_when_mt5_not_connected(self, client: TestClient) -> None:
        main.app.state.mt5_connected = False
        try:
            resp = client.get("/history")
            assert resp.status_code == 503
        finally:
            main.app.state.mt5_connected = True


# ---------------------------------------------------------------------------
# /account
# ---------------------------------------------------------------------------

class TestAccount:
    def _mock_account(self) -> dict:
        return {
            "login": 12345678,
            "name": "Test Account",
            "server": "DemoServer-MT5",
            "currency": "USD",
            "balance": 10_000.00,
            "equity": 10_150.00,
            "margin": 500.00,
            "margin_free": 9_650.00,
            "leverage": 100,
        }

    def test_returns_200(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_account_info", return_value=self._mock_account()):
            resp = client.get("/account")
        assert resp.status_code == 200

    def test_response_has_currency(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_account_info", return_value=self._mock_account()):
            body = client.get("/account").json()
        assert body["currency"] == "USD"

    def test_503_when_account_info_is_none(self, client: TestClient) -> None:
        with patch.object(mt5_client, "get_account_info", return_value=None):
            resp = client.get("/account")
        assert resp.status_code == 503

    def test_503_when_mt5_not_connected(self, client: TestClient) -> None:
        main.app.state.mt5_connected = False
        try:
            resp = client.get("/account")
            assert resp.status_code == 503
        finally:
            main.app.state.mt5_connected = True


# ---------------------------------------------------------------------------
# POST /connect
# ---------------------------------------------------------------------------

class TestConnect:
    def _account(self) -> dict:
        return {
            "login": 99887766,
            "name": "Demo Trader",
            "server": "ICMarkets-MT5",
            "currency": "USD",
            "balance": 5_000.00,
            "equity": 5_050.00,
            "margin": 0.00,
            "margin_free": 5_050.00,
            "leverage": 500,
        }

    def test_returns_200_on_valid_credentials(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "shutdown"),
            patch.object(mt5_client, "initialize", return_value=True),
            patch.object(mt5_client, "get_account_info", return_value=self._account()),
        ):
            resp = client.post(
                "/connect",
                json={"login": 99887766, "password": "inv_pass", "server": "ICMarkets-MT5"},
            )
        assert resp.status_code == 200

    def test_response_has_status_connected(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "shutdown"),
            patch.object(mt5_client, "initialize", return_value=True),
            patch.object(mt5_client, "get_account_info", return_value=self._account()),
        ):
            body = client.post(
                "/connect",
                json={"login": 99887766, "password": "inv_pass", "server": "ICMarkets-MT5"},
            ).json()
        assert body["status"] == "connected"
        assert body["account"]["login"] == 99887766

    def test_returns_401_on_bad_credentials(self, client: TestClient) -> None:
        with (
            patch.object(mt5_client, "shutdown"),
            patch.object(mt5_client, "initialize", return_value=False),
        ):
            resp = client.post(
                "/connect",
                json={"login": 0, "password": "wrong", "server": "BadServer"},
            )
        assert resp.status_code == 401

    def test_sets_mt5_connected_false_before_reinit(self, client: TestClient) -> None:
        """mt5_connected must be set to False before re-initialising."""
        states: list[bool] = []

        def fake_initialize(**kwargs: Any) -> bool:
            states.append(main.app.state.mt5_connected)
            return True

        with (
            patch.object(mt5_client, "shutdown"),
            patch.object(mt5_client, "initialize", side_effect=fake_initialize),
            patch.object(mt5_client, "get_account_info", return_value=self._account()),
        ):
            client.post(
                "/connect",
                json={"login": 99887766, "password": "inv_pass", "server": "ICMarkets-MT5"},
            )
        assert states[0] is False  # must be False while connecting

    def test_missing_field_returns_422(self, client: TestClient) -> None:
        resp = client.post("/connect", json={"login": 12345})  # missing password + server
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# API key auth
# ---------------------------------------------------------------------------

class TestApiKeyAuth:
    def test_no_key_required_when_env_unset(self, client: TestClient) -> None:
        """When API_KEY env var is not set, all requests pass through."""
        with patch.object(main, "_API_KEY", None):
            with patch.object(mt5_client, "get_open_positions", return_value=[]):
                with patch.object(mt5_client, "get_recent_deals", return_value=[]):
                    resp = client.get("/trades")
        assert resp.status_code == 200

    def test_wrong_key_returns_403(self, client: TestClient) -> None:
        with patch.object(main, "_API_KEY", "secret123"):
            resp = client.get("/trades", headers={"X-API-Key": "wrongkey"})
        assert resp.status_code == 403

    def test_correct_key_passes(self, client: TestClient) -> None:
        with patch.object(main, "_API_KEY", "secret123"):
            with patch.object(mt5_client, "get_open_positions", return_value=[]):
                with patch.object(mt5_client, "get_recent_deals", return_value=[]):
                    resp = client.get("/trades", headers={"X-API-Key": "secret123"})
        assert resp.status_code == 200
