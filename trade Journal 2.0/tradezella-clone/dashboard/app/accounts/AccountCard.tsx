/**
 * app/accounts/AccountCard.tsx — Clickable card for one linked MT5 account.
 *
 * Client Component because clicking the card triggers an async fetch to
 * /api/select-account and then navigates programmatically via useRouter.
 *
 * WHAT HAPPENS WHEN CLICKED:
 *   1. POST to /api/select-account with { login }
 *   2. Server fetches stored credentials → reconnects VPS → sets mt5_account cookie
 *   3. On success: router.push("/overview") takes the user to the dashboard
 *   4. On failure: error message is shown inside the card
 *
 * NOTE: We don't pass the password here — the server reads it from Supabase.
 * This is intentional: passwords are never sent to the browser.
 */

"use client"; // Required: uses useState, useRouter, onClick handler

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shape of credential data passed from the /accounts Server Component */
interface Cred {
  id: string;       // UUID primary key from mt5_credentials
  login: number;    // MT5 account number (displayed as "#login")
  server: string;   // broker server name (e.g. "FundedNext-Server 2")
  label: string | null; // user-defined nickname (empty string if not set)
  // Joined from the accounts table — may be null if the account was never synced
  account?: {
    id: string;
    name: string | null;      // account holder name from MT5
    currency: string | null;  // account currency (e.g. "USD")
    balance: number | null;   // current balance (null if not yet synced)
  } | null;
}

/**
 * AccountCard — displays one MT5 account with its name, login, server,
 * and balance. Clicking connects the VPS to this account and redirects
 * to the dashboard.
 */
export default function AccountCard({ cred }: { cred: Cred }) {
  const router = useRouter();

  // Button state: tracks the async select-account request
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(""); // shown inside the card on failure

  /**
   * Handles account selection.
   * POSTs to /api/select-account which reconnects VPS and sets the session cookie.
   * On success, navigates to /overview.
   * On failure, shows the error message inline inside the card.
   */
  async function handleSelect() {
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/select-account", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ login: cred.login }), // send only the login, not the password
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to connect");

      // Success: the server has set the mt5_account cookie.
      // Navigate to overview and refresh so Server Components see the new cookie.
      router.push("/overview");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setLoading(false); // re-enable the button so user can retry
    }
  }

  // Display name priority: user label → MT5 name → fallback with account number
  const displayName = cred.label ?? cred.account?.name ?? `Account #${cred.login}`;
  const balance     = cred.account?.balance;
  const currency    = cred.account?.currency ?? "USD";

  return (
    <button
      onClick={handleSelect}
      disabled={loading}   // prevent double-clicks during the async connect
      className="w-full text-left bg-[#1a1d27] hover:bg-[#222536] disabled:opacity-60
                 border border-[#2a2d3a] hover:border-indigo-800/60
                 rounded-xl px-5 py-4 transition group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">

          {/* Broker icon — chart icon in an indigo circle */}
          <div className="w-10 h-10 rounded-lg bg-indigo-900/30 border border-indigo-800/40
                          flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              {/* Bar chart icon representing MT5 account */}
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>

          {/* Account info — name on top, login + platform on bottom */}
          <div>
            <p className="text-white font-medium text-sm">{displayName}</p>
            <p className="text-gray-500 text-xs mt-0.5">
              #{cred.login} · MetaTrader 5 · {cred.server}
            </p>
          </div>
        </div>

        {/* Right side: balance + action arrow */}
        <div className="flex items-center gap-4">
          {/* Balance — only shown if the account has been synced at least once */}
          {balance != null && (
            <div className="text-right">
              <p className="text-white text-sm font-medium">
                {new Intl.NumberFormat("en-US", {
                  style:                 "currency",
                  currency,
                  minimumFractionDigits: 2,
                }).format(balance)}
              </p>
              <p className="text-gray-600 text-xs">balance</p>
            </div>
          )}

          {/* Action indicator: spinner while loading, chevron otherwise */}
          <div className="text-gray-500 group-hover:text-indigo-400 transition">
            {loading ? (
              // Animated spinner while VPS is connecting
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              // Right-pointing chevron — indicates this card is clickable
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Error message — shown inline below the card content when connection fails */}
      {error && (
        <p className="mt-3 text-red-400 text-xs bg-red-950/30 border border-red-900/40
                      rounded-lg px-3 py-2 text-left">
          {error}
        </p>
      )}
    </button>
  );
}
