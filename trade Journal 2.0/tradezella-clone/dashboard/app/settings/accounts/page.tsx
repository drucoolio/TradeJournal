/**
 * app/settings/accounts/page.tsx — Accounts management page (Server Component).
 *
 * Renders inside the Settings layout (Sidebar + SettingsSidebar + content).
 * Shows all linked MT5 accounts in a Tradezella-style table with columns:
 *   Account name | Broker | Balance | Profit calc method | Last update | Type | Actions
 *
 * DATA SOURCE:
 *   Reads from two tables via the service-role client:
 *   1. mt5_credentials — login, server, label, created_at (user's saved connections)
 *   2. accounts — name, balance, currency, updated_at (synced account data)
 *   These are joined client-side by matching on login number, because mt5_credentials
 *   may exist before the account has ever been synced (balance would be null).
 *
 * The "Add account" button links to /connect where users enter MT5 credentials.
 * Each row has a clickable account name that selects it and goes to the dashboard.
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import type { AccountRowData } from "@/lib/types";
import AccountRow from "./AccountRow";

export default async function SettingsAccountsPage() {
  // Verify authentication — redirect to login if no session
  const user = await requireAuth();

  // Use service-role client to bypass RLS for reading credential + account data
  const supa = serverClient();

  // Fetch all MT5 credentials for this user
  const { data: creds, error } = await supa
    .from("mt5_credentials")
    .select("id, login, server, label, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[settings/accounts] Failed to fetch credentials:", error.message);
  }

  // For each credential, look up the matching account row (joined by login number)
  // This is done sequentially because we need per-login lookups.
  // Account may not exist if the user added credentials but never synced.
  const rows: AccountRowData[] = [];
  for (const cred of creds ?? []) {
    const { data: acc } = await supa
      .from("accounts")
      .select("id, name, currency, balance, updated_at")
      .eq("login", cred.login)
      .eq("user_id", user.id)
      .single();

    // Count trades for this account (used in the delete confirmation modal message)
    let tradeCount = 0;
    if (acc?.id) {
      const { count } = await supa
        .from("trades")
        .select("*", { count: "exact", head: true })
        .eq("account_id", acc.id);
      tradeCount = count ?? 0;
    }

    rows.push({
      credId: cred.id,
      login: cred.login,
      server: cred.server,
      label: cred.label,
      createdAt: cred.created_at,
      accountId: acc?.id ?? null,
      name: acc?.name ?? null,
      currency: acc?.currency ?? null,
      balance: acc?.balance ?? null,
      updatedAt: acc?.updated_at ?? null,
      tradeCount,
    });
  }

  return (
    <div className="py-4">
      {/* Page header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Accounts</h2>
          {/* "Add account" button — links to /connect */}
          <a
            href="/settings/connect"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500
                       text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add account
          </a>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        You can have unlimited active accounts
      </p>

      {/* Accounts table */}
      {rows.length === 0 ? (
        /* Empty state — no accounts linked yet */
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium mb-1">No accounts linked yet</p>
          <p className="text-gray-500 text-sm mb-6">Connect your first MT5 account to get started</p>
          <a
            href="/settings/connect"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500
                       text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
          >
            Connect MT5 account
          </a>
        </div>
      ) : (
        /* Table — one row per linked MT5 account.
           overflow-visible is required so the three-dot dropdown menu
           can extend beyond the table container without being clipped. */
        <div className="bg-white border border-gray-200 rounded-xl overflow-visible">
          <table className="w-full text-left">
            {/* Column headers */}
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Account name</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Broker</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Balance</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Profit calculation method</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Last update</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AccountRow key={row.credId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
