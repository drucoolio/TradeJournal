"""
mac/receiver.py — Calls the VPS FastAPI bridge and prints raw MT5 trade data to stdout.

Usage:
    python receiver.py                  # poll /trades once
    python receiver.py --poll 5         # poll /trades every 5 seconds
    python receiver.py --history        # fetch full history
    python receiver.py --history --from-date 2024-01-01

Environment variables (put in a .env file or export before running):
    VPS_URL     Base URL of the VPS bridge, e.g. http://79.108.225.44:8000
    API_KEY     Optional — must match the API_KEY set on the VPS
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

load_dotenv()  # reads .env in the current directory (or any parent)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
VPS_URL: str = os.getenv("VPS_URL", "http://79.108.225.44:8000").rstrip("/")
API_KEY: str | None = os.getenv("API_KEY")

_HEADERS: dict[str, str] = {}
if API_KEY:
    _HEADERS["X-API-Key"] = API_KEY

TIMEOUT_SECONDS: float = 10.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _print_json(data: dict | list, label: str = "") -> None:
    """Pretty-print JSON to stdout with an optional header label."""
    if label:
        ts = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"\n{'='*60}")
        print(f"  {label}  [{ts}]")
        print("=" * 60)
    print(json.dumps(data, indent=2))


def _get(path: str, params: dict | None = None) -> dict:
    """
    GET {VPS_URL}{path} and return the parsed JSON body.
    Raises SystemExit on HTTP or network errors so the caller doesn't have to.
    """
    url = f"{VPS_URL}{path}"
    try:
        resp = httpx.get(url, headers=_HEADERS, params=params, timeout=TIMEOUT_SECONDS)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        print(
            f"[ERROR] HTTP {exc.response.status_code} from {url}: "
            f"{exc.response.text}",
            file=sys.stderr,
        )
        sys.exit(1)
    except httpx.RequestError as exc:
        print(f"[ERROR] Could not reach VPS at {url}: {exc}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def fetch_health() -> None:
    """Check that the VPS bridge is up and MT5 is connected."""
    data = _get("/health")
    _print_json(data, label="HEALTH CHECK")
    if not data.get("mt5_connected"):
        print(
            "\n[WARNING] MT5 terminal is not connected on the VPS. "
            "Trade endpoints will return 503.",
            file=sys.stderr,
        )


def fetch_trades(lookback_hours: int = 24) -> dict:
    """Fetch open positions + recently closed deals."""
    params = {"lookback_hours": lookback_hours}
    data = _get("/trades", params=params)
    _print_json(data, label=f"TRADES  (lookback={lookback_hours}h)")
    _print_summary(data)
    return data


def fetch_history(from_date: str | None = None, to_date: str | None = None) -> dict:
    """Fetch full deal history."""
    params: dict = {}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date
    data = _get("/history", params=params)
    _print_json(data, label="FULL HISTORY")
    print(f"\n  Total deals returned: {data.get('meta', {}).get('count', '?')}")
    return data


def _print_summary(trades_response: dict) -> None:
    """Print a compact human-readable summary of the /trades response."""
    meta = trades_response.get("meta", {})
    open_pos = trades_response.get("open_positions", [])
    recent = trades_response.get("recent_deals", [])

    print(f"\n  Open positions : {meta.get('open_count', len(open_pos))}")
    print(f"  Closed deals   : {meta.get('recent_deals_count', len(recent))}")

    if open_pos:
        print("\n  Open positions:")
        for p in open_pos:
            print(
                f"    #{p['ticket']}  {p['symbol']}  {p['direction'].upper()}"
                f"  {p['lot_size']} lots  profit={p['profit']}"
            )

    if recent:
        print(f"\n  Recently closed ({meta.get('lookback_hours', '?')}h):")
        for d in recent:
            print(
                f"    #{d['ticket']}  {d['symbol']}  {d['direction'].upper()}"
                f"  {d['lot_size']} lots  profit={d['profit']}"
                f"  @ {d['time']}"
            )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="receiver",
        description="Pull raw MT5 trade data from the VPS bridge and print it as JSON.",
    )
    parser.add_argument(
        "--history",
        action="store_true",
        help="Fetch full deal history instead of /trades.",
    )
    parser.add_argument(
        "--from-date",
        metavar="DATE",
        help="History start date, e.g. 2024-01-01 (only used with --history).",
    )
    parser.add_argument(
        "--to-date",
        metavar="DATE",
        help="History end date, e.g. 2024-12-31 (only used with --history).",
    )
    parser.add_argument(
        "--lookback",
        type=int,
        default=24,
        metavar="HOURS",
        help="How many hours back to look for closed deals (default: 24).",
    )
    parser.add_argument(
        "--poll",
        type=int,
        default=0,
        metavar="SECONDS",
        help="If > 0, poll /trades every SECONDS seconds until Ctrl-C.",
    )
    parser.add_argument(
        "--health",
        action="store_true",
        help="Only check /health and exit.",
    )
    parser.add_argument(
        "--vps-url",
        metavar="URL",
        help=f"Override VPS base URL (default: {VPS_URL}).",
    )
    return parser


def main() -> None:
    args = _build_parser().parse_args()

    global VPS_URL
    if args.vps_url:
        VPS_URL = args.vps_url.rstrip("/")

    if args.health:
        fetch_health()
        return

    if args.history:
        fetch_history(from_date=args.from_date, to_date=args.to_date)
        return

    if args.poll > 0:
        print(f"Polling /trades every {args.poll}s — press Ctrl-C to stop.\n")
        try:
            while True:
                fetch_trades(lookback_hours=args.lookback)
                time.sleep(args.poll)
        except KeyboardInterrupt:
            print("\nStopped.")
        return

    # Default: single fetch
    fetch_trades(lookback_hours=args.lookback)


if __name__ == "__main__":
    main()
