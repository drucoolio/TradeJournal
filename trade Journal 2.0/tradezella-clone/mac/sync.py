"""
mac/sync.py — Syncs MT5 trade history from the VPS into Supabase.

Flow:
  1. Fetch account info from VPS → upsert to `accounts` table
  2. Fetch full deal history from VPS → normalize into TradeRows
  3. Upsert all trades into Supabase (idempotent — safe to re-run)
  4. Rebuild daily session summaries

Usage:
  python sync.py                    # full sync (all history)
  python sync.py --from 2024-01-01  # sync from a specific date
  python sync.py --dry-run          # print what would be inserted, no writes
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

from normalizer import normalize_deals, trade_row_to_dict

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
VPS_URL        = os.getenv("VPS_URL", "http://79.108.225.44:8000").rstrip("/")
VPS_API_KEY    = os.getenv("VPS_API_KEY", "")
SUPABASE_URL   = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

VPS_HEADERS = {"X-API-Key": VPS_API_KEY} if VPS_API_KEY else {}
SUPA_HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates",  # upsert behaviour
}

TIMEOUT = 60.0  # seconds


# ---------------------------------------------------------------------------
# VPS helpers
# ---------------------------------------------------------------------------

def vps_get(client: httpx.Client, path: str, params: dict | None = None) -> dict:
    url = f"{VPS_URL}{path}"
    resp = client.get(url, headers=VPS_HEADERS, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def fetch_account(client: httpx.Client) -> dict:
    return vps_get(client, "/account")


def fetch_history(client: httpx.Client, from_date: str | None = None) -> list[dict]:
    params = {}
    if from_date:
        params["from_date"] = from_date
    data = vps_get(client, "/history", params=params)
    return data.get("deals", [])


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def supa_upsert(client: httpx.Client, table: str, rows: list[dict]) -> dict:
    """Upsert a batch of rows into a Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = client.post(url, headers=SUPA_HEADERS, json=rows, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json() if resp.text else {}


def supa_select(client: httpx.Client, table: str, filters: str = "") -> list[dict]:
    """Select rows from a Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**SUPA_HEADERS, "Accept": "application/json"}
    params = {"select": "*"}
    if filters:
        params["or"] = filters
    resp = client.get(url, headers=headers, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Sync steps
# ---------------------------------------------------------------------------

def sync_account(client: httpx.Client, dry_run: bool) -> str:
    """Upsert account info and return the Supabase account UUID."""
    print("→ Fetching account info from VPS…")
    info = fetch_account(client)

    row = {
        "login":    info["login"],
        "name":     info.get("name", ""),
        "broker":   info.get("server", ""),
        "currency": info.get("currency", "USD"),
        "balance":  info.get("balance", 0),
        "equity":   info.get("equity", 0),
        "leverage": info.get("leverage", 0),
    }

    print(f"   Account #{info['login']} — {info.get('name')} ({info.get('server')})")

    if dry_run:
        print("   [dry-run] Would upsert account row.")
        return "dry-run-uuid"

    # Upsert by login (unique constraint)
    # ?on_conflict=login tells Supabase which column to deduplicate on
    url = f"{SUPABASE_URL}/rest/v1/accounts?on_conflict=login"
    resp = client.post(
        url,
        headers={**SUPA_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
        json=[row],
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    account_id: str = resp.json()[0]["id"]
    print(f"   Supabase account id: {account_id}")
    return account_id


def sync_trades(
    client: httpx.Client,
    account_id: str,
    from_date: str | None,
    dry_run: bool,
) -> int:
    """Fetch history, normalize, upsert to Supabase. Returns number of trades upserted."""
    print(f"\n→ Fetching deal history from VPS{' (from ' + from_date + ')' if from_date else ''}…")
    deals = fetch_history(client, from_date=from_date)
    print(f"   {len(deals)} raw deals received")

    rows = normalize_deals(deals)
    print(f"   {len(rows)} completed trades after normalization")

    if not rows:
        print("   Nothing to sync.")
        return 0

    if dry_run:
        print(f"   [dry-run] Would upsert {len(rows)} trades. Sample:")
        sample = trade_row_to_dict(rows[-1], account_id)
        print(json.dumps(sample, indent=4, default=str))
        return len(rows)

    # Upsert in batches of 500 (Supabase payload limit)
    batch_size = 500
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        dicts = [trade_row_to_dict(r, account_id) for r in batch]
        url = f"{SUPABASE_URL}/rest/v1/trades?on_conflict=account_id,position_id"
        resp = client.post(
            url,
            headers={**SUPA_HEADERS, "Prefer": "resolution=merge-duplicates"},
            json=dicts,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        total += len(batch)
        print(f"   Upserted batch {i // batch_size + 1}: {len(batch)} trades")

    return total


def rebuild_sessions(
    client: httpx.Client,
    account_id: str,
    dry_run: bool,
) -> None:
    """Aggregate trades by date into daily session rows."""
    print("\n→ Rebuilding daily sessions…")

    # Fetch all trades for this account from Supabase
    url = f"{SUPABASE_URL}/rest/v1/trades"
    headers = {**SUPA_HEADERS, "Accept": "application/json"}
    resp = client.get(
        url,
        headers=headers,
        params={"select": "close_time,net_pnl", "account_id": f"eq.{account_id}"},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    trades = resp.json()

    # Aggregate by date
    sessions: dict[str, dict] = {}
    for t in trades:
        if not t.get("close_time"):
            continue
        date = t["close_time"][:10]  # YYYY-MM-DD
        if date not in sessions:
            sessions[date] = {"date": date, "account_id": account_id, "total_pnl": 0.0, "trade_count": 0}
        sessions[date]["total_pnl"]    += float(t.get("net_pnl") or 0)
        sessions[date]["trade_count"]  += 1

    session_rows = list(sessions.values())
    print(f"   {len(session_rows)} trading days found")

    if dry_run:
        print(f"   [dry-run] Would upsert {len(session_rows)} session rows.")
        return

    if session_rows:
        url = f"{SUPABASE_URL}/rest/v1/sessions?on_conflict=account_id,date"
        resp = client.post(
            url,
            headers={**SUPA_HEADERS, "Prefer": "resolution=merge-duplicates"},
            json=session_rows,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        print(f"   Sessions upserted.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync MT5 trade history from VPS into Supabase."
    )
    parser.add_argument(
        "--from",
        dest="from_date",
        metavar="DATE",
        help="Only sync deals from this date forward, e.g. 2024-01-01",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and normalize data but do not write to Supabase.",
    )
    args = parser.parse_args()

    # Validate config
    if not SUPABASE_URL:
        print("[ERROR] NEXT_PUBLIC_SUPABASE_URL not set in .env", file=sys.stderr)
        sys.exit(1)
    if not SERVICE_KEY:
        print("[ERROR] SUPABASE_SERVICE_ROLE_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    print("=" * 50)
    print("  MT5 → Supabase Sync")
    print(f"  VPS:      {VPS_URL}")
    print(f"  Supabase: {SUPABASE_URL}")
    if args.dry_run:
        print("  Mode:     DRY RUN (no writes)")
    print("=" * 50)

    with httpx.Client() as client:
        try:
            account_id = sync_account(client, dry_run=args.dry_run)
            count = sync_trades(
                client,
                account_id,
                from_date=args.from_date,
                dry_run=args.dry_run,
            )
            if not args.dry_run:
                rebuild_sessions(client, account_id, dry_run=False)

            print(f"\n✅ Sync complete — {count} trades upserted.")

        except httpx.HTTPStatusError as exc:
            print(f"\n[ERROR] HTTP {exc.response.status_code}: {exc.response.text}", file=sys.stderr)
            sys.exit(1)
        except httpx.RequestError as exc:
            print(f"\n[ERROR] Network error: {exc}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
