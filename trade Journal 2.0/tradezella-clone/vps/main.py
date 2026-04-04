"""
main.py — FastAPI bridge between MetaTrader 5 (running on VPS) and the Mac.

Endpoints:
  GET  /health   — liveness check (no MT5 required)
  POST /connect  — log into an MT5 account (login, investor password, server)
  GET  /trades   — open positions + deals closed in the last N hours
  GET  /history  — full deal history (optionally filtered by date range)
  GET  /account  — account info (balance, equity, currency)

Security:
  Set API_KEY in the environment to require callers to pass
  X-API-Key: <value> in every request. Leave API_KEY unset to
  disable auth (useful during local testing).

Run on the VPS:
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException, Query, Security, status
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import mt5_client

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional API-key authentication
# ---------------------------------------------------------------------------
_API_KEY = os.getenv("API_KEY")  # set in .env on the VPS; leave unset to disable
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(key: str | None = Security(_api_key_header)) -> None:
    """Dependency: validate X-API-Key header if API_KEY env var is configured."""
    if _API_KEY and key != _API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key.",
        )


# ---------------------------------------------------------------------------
# Application lifespan — connect/disconnect MT5 around the server lifetime
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Connect to MT5 on startup, disconnect on shutdown."""
    logger.info("Connecting to MetaTrader 5 terminal …")
    connected = mt5_client.initialize()
    if not connected:
        logger.error(
            "Failed to connect to MT5. "
            "Make sure the MT5 terminal is running and logged in."
        )
        # We still start the server so /health works — MT5 endpoints will 503.
    app.state.mt5_connected = connected
    yield
    mt5_client.shutdown()
    logger.info("MT5 disconnected — server shutting down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="MT5 Bridge API",
    description="Serves raw MetaTrader 5 trade data as JSON for the Tradezella clone.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Mac (any origin during development) to call this API.
# Tighten to the Mac's actual IP in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _require_mt5_connected() -> None:
    """Raise 503 if MT5 failed to connect at startup."""
    if not getattr(app.state, "mt5_connected", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "MT5 terminal is not connected. "
                "Ensure MetaTrader 5 is running and logged in on the VPS."
            ),
        )


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    login: int
    password: str   # investor (read-only) password — never the master password
    server: str     # broker server name, e.g. "ICMarkets-MT5"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health", tags=["meta"])
async def health() -> dict[str, Any]:
    """Simple liveness probe. Returns MT5 connection status."""
    return {
        "status": "ok",
        "mt5_connected": getattr(app.state, "mt5_connected", False),
        "server_time_utc": datetime.now(tz=timezone.utc).isoformat(),
    }


@app.post(
    "/connect",
    tags=["meta"],
    dependencies=[Depends(verify_api_key)],
    summary="Log into an MT5 account",
)
async def connect(body: ConnectRequest) -> dict[str, Any]:
    """
    Disconnect from the current MT5 account and reconnect with the supplied
    credentials. Use the investor (read-only) password — never the master password.

    Returns account info on success, raises 401 on bad credentials.
    """
    logger.info("POST /connect — login=%s server=%s", body.login, body.server)

    # Disconnect the current session first
    mt5_client.shutdown()
    app.state.mt5_connected = False

    # Reconnect with the new credentials
    connected = mt5_client.initialize(
        login=body.login,
        password=body.password,
        server=body.server,
    )

    if not connected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "MT5 rejected the credentials. "
                "Check the account number, investor password, and server name."
            ),
        )

    app.state.mt5_connected = True
    account = mt5_client.get_account_info()
    logger.info("Connected to account %s (%s)", body.login, body.server)

    return {
        "status": "connected",
        "account": account,
    }


@app.get(
    "/trades",
    tags=["trades"],
    dependencies=[Depends(verify_api_key)],
    summary="Open positions + recently closed deals",
)
async def get_trades(
    lookback_hours: int = Query(
        default=24,
        ge=1,
        le=720,  # max 30 days lookback
        description="How many hours back to look for recently closed deals.",
    ),
) -> dict[str, Any]:
    """
    Returns:
    - **open_positions**: all currently open trades
    - **recent_deals**: deals (exits) closed within the last `lookback_hours` hours
    """
    _require_mt5_connected()

    open_positions = mt5_client.get_open_positions()
    recent_deals = mt5_client.get_recent_deals(lookback_hours=lookback_hours)

    logger.info(
        "/trades — %d open positions, %d recent deals (lookback=%dh)",
        len(open_positions),
        len(recent_deals),
        lookback_hours,
    )

    return {
        "open_positions": open_positions,
        "recent_deals": recent_deals,
        "meta": {
            "open_count": len(open_positions),
            "recent_deals_count": len(recent_deals),
            "lookback_hours": lookback_hours,
            "fetched_at_utc": datetime.now(tz=timezone.utc).isoformat(),
        },
    }


@app.get(
    "/history",
    tags=["trades"],
    dependencies=[Depends(verify_api_key)],
    summary="Full historical deal data",
)
async def get_history(
    from_date: str | None = Query(
        default=None,
        description="Start date in ISO-8601 format, e.g. 2024-01-01 or 2024-01-01T00:00:00Z",
    ),
    to_date: str | None = Query(
        default=None,
        description="End date in ISO-8601 format. Defaults to now.",
    ),
) -> dict[str, Any]:
    """
    Returns all deals between `from_date` and `to_date`.
    When `from_date` is omitted, history is fetched from 2000-01-01 (all available).
    """
    _require_mt5_connected()

    from_dt: datetime | None = None
    to_dt: datetime | None = None

    try:
        if from_date:
            from_dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            if from_dt.tzinfo is None:
                from_dt = from_dt.replace(tzinfo=timezone.utc)
        if to_date:
            to_dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
            if to_dt.tzinfo is None:
                to_dt = to_dt.replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format: {exc}",
        ) from exc

    deals = mt5_client.get_full_history(from_dt=from_dt, to_dt=to_dt)

    logger.info(
        "/history — %d deals returned (from=%s, to=%s)",
        len(deals),
        from_dt,
        to_dt,
    )

    return {
        "deals": deals,
        "meta": {
            "count": len(deals),
            "from_date": from_dt.isoformat() if from_dt else None,
            "to_date": (to_dt or datetime.now(tz=timezone.utc)).isoformat(),
            "fetched_at_utc": datetime.now(tz=timezone.utc).isoformat(),
        },
    }


@app.get(
    "/account",
    tags=["meta"],
    dependencies=[Depends(verify_api_key)],
    summary="MT5 account information",
)
async def get_account() -> dict[str, Any]:
    """Returns basic account info: balance, equity, currency, server, leverage."""
    _require_mt5_connected()
    info = mt5_client.get_account_info()
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MT5 returned no account info.",
        )
    return info
