/**
 * app/settings/connect/page.tsx — Add account page inside the Settings layout.
 *
 * Client Component that renders the broker selection and MT5 credential form
 * inside the Settings layout (with sidebar + settings nav visible).
 *
 * Includes a "Back to Accounts" link at the top so the user can navigate
 * back without losing their place in the settings flow.
 *
 * FLOW:
 *   1. User clicks "Add account" on /settings/accounts
 *   2. Lands here — sees broker selection cards (MT5, cTrader)
 *   3. Selects MT5 → form appears for login, password, server
 *   4. On success → redirects back to /settings/accounts
 *
 * This page replicates the logic from the old /connect page but fits
 * within the light-themed settings layout instead of a standalone dark page.
 */

"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BROKERS, type BrokerType } from "@/lib/broker";

// ---------------------------------------------------------------------------
// Broker card icons — same as the old /connect page
// ---------------------------------------------------------------------------

/** MetaTrader 5 logo — blue square with chart line */
function MT5Icon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="8" fill="#1565C0" />
      <path d="M8 28L14 12l6 10 6-10 6 16" stroke="white" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** cTrader logo — orange square with "cT" text */
function CTraderIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
      <rect width="40" height="40" rx="8" fill="#E65100" />
      <text x="7" y="28" fill="white" fontSize="18" fontWeight="bold"
        fontFamily="system-ui, sans-serif">cT</text>
    </svg>
  );
}

const BROKER_ICONS: Record<BrokerType, () => JSX.Element> = {
  mt5: MT5Icon,
  ctrader: CTraderIcon,
};

// ---------------------------------------------------------------------------
// Step 1 — Broker selection cards
// ---------------------------------------------------------------------------

/**
 * Renders clickable cards for each supported broker platform.
 * Unavailable brokers (cTrader) show a "Soon" badge and are disabled.
 */
function BrokerSelect({ onSelect }: { onSelect: (broker: BrokerType) => void }) {
  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">Choose your broker</h3>
        <p className="text-sm text-gray-500 mt-1">Select the platform your account is on</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {BROKERS.map((broker) => {
          const Icon = BROKER_ICONS[broker.id];
          return (
            <button
              key={broker.id}
              onClick={() => broker.available && onSelect(broker.id)}
              disabled={!broker.available}
              className={`relative flex flex-col items-center gap-3 rounded-xl border p-5 transition
                ${broker.available
                  ? "border-gray-200 bg-white hover:border-indigo-400 hover:shadow-md cursor-pointer"
                  : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                }`}
            >
              {/* "Soon" badge for unavailable brokers */}
              {!broker.available && (
                <span className="absolute top-2.5 right-2.5 rounded-full bg-gray-200 px-2 py-0.5
                                 text-[10px] font-medium text-gray-500">
                  Soon
                </span>
              )}
              <Icon />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">{broker.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{broker.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — MT5 credentials form
// ---------------------------------------------------------------------------

/**
 * Form for entering MT5 credentials: account ID, investor password, server.
 * On success, redirects to /settings/accounts.
 */
function MT5Form({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ login: "", password: "", server: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation before hitting the API
    const loginNum = parseInt(form.login, 10);
    if (!form.login || isNaN(loginNum)) {
      setError("Account ID must be a number.");
      return;
    }
    if (!form.password) { setError("Investor password is required."); return; }
    if (!form.server)   { setError("Server name is required."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: "mt5",
          login: loginNum,
          password: form.password,
          server: form.server,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Connection failed.");
        return;
      }

      // Success — go back to accounts list to see the new account
      router.push("/settings/accounts");
      router.refresh();
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Back button + broker icon header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <MT5Icon />
          <span className="font-semibold text-gray-900">MetaTrader 5</span>
        </div>
      </div>

      {/* Account ID + Investor Password — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="login" className="block text-xs font-medium text-gray-500 mb-1.5">
            Account ID
          </label>
          <input
            id="login" name="login" type="text" inputMode="numeric"
            autoComplete="username" placeholder="12345678"
            value={form.login} onChange={handleChange} disabled={loading}
            className="w-full rounded-lg border border-gray-200 bg-white
              px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
              focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400
              disabled:opacity-50 transition"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-medium text-gray-500 mb-1.5">
            Investor Password
          </label>
          <input
            id="password" name="password" type="password"
            autoComplete="current-password" placeholder="••••••••"
            value={form.password} onChange={handleChange} disabled={loading}
            className="w-full rounded-lg border border-gray-200 bg-white
              px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
              focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400
              disabled:opacity-50 transition"
          />
        </div>
      </div>

      {/* Server */}
      <div>
        <label htmlFor="server" className="block text-xs font-medium text-gray-500 mb-1.5">
          Server
        </label>
        <input
          id="server" name="server" type="text" autoComplete="off"
          placeholder="ICMarkets-MT5"
          value={form.server} onChange={handleChange} disabled={loading}
          className="w-full rounded-lg border border-gray-200 bg-white
            px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400
            focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400
            disabled:opacity-50 transition"
        />
        <p className="mt-1.5 text-xs text-gray-400">
          Find this in MT5 under File → Open an Account
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none"
            viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit" disabled={loading}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500
          px-4 py-2.5 text-sm font-semibold text-white
          disabled:opacity-60 disabled:cursor-not-allowed
          transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            Connecting…
          </>
        ) : "Connect"}
      </button>

      <p className="text-center text-xs text-gray-400">
        Use your{" "}
        <span className="text-gray-600 font-medium">investor (read-only)</span>{" "}
        password — your master password is never needed.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page — renders inside the Settings layout with back navigation
// ---------------------------------------------------------------------------

export default function SettingsConnectPage() {
  const [selectedBroker, setSelectedBroker] = useState<BrokerType | null>(null);

  return (
    <div className="py-4">
      {/* Back to accounts link — always visible at the top */}
      <div className="mb-6">
        <Link
          href="/settings/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Accounts
        </Link>
      </div>

      {/* Connect form card — white card with the broker selection or MT5 form */}
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Add account</h2>
        <p className="text-sm text-gray-500 mb-6">Connect a new trading account</p>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          {selectedBroker === null ? (
            <BrokerSelect onSelect={setSelectedBroker} />
          ) : selectedBroker === "mt5" ? (
            <MT5Form onBack={() => setSelectedBroker(null)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
