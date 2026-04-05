/**
 * app/day-view/page.tsx — Day View page (Server Component).
 *
 * Matches Tradezella's Day View layout — a chronological journal of trading
 * days, each day expandable to show stats, equity curve, and the full trade list.
 *
 * DATA FLOW:
 *   Server (this file) → fetch all trades + sessions for user's accounts
 *   Client (DayViewClient) → group by day, render cards, handle filters/modals
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import { getAccountsByUserId, getTradesForAccounts } from "@/lib/db";
import type { DbTrade, DbSession } from "@/lib/db";
import DayViewClient from "./DayViewClient";

export default async function DayViewPage() {
  // --- Auth gate ---
  const user = await requireAuth();

  // --- All accounts belonging to this user ---
  const accounts = await getAccountsByUserId(user.id);
  const accountIds = accounts.map((a) => a.id);

  // --- Fetch all trades and sessions for those accounts in parallel ---
  const supa = serverClient();
  const [trades, sessionsResult, rulesResult] = await Promise.all([
    getTradesForAccounts(accountIds),
    accountIds.length > 0
      ? supa
          .from("sessions")
          .select("*")
          .in("account_id", accountIds)
          .order("date", { ascending: false })
      : Promise.resolve({ data: [] as DbSession[] }),
    supa
      .from("rules")
      .select("id, name, description")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const sessions = (sessionsResult.data ?? []) as DbSession[];
  const rules = (rulesResult.data ?? []) as {
    id: string;
    name: string;
    description: string | null;
  }[];

  return (
    <DayViewClient
      trades={trades as DbTrade[]}
      accounts={accounts.map((a) => ({
        id: a.id,
        login: a.login,
        name: a.name,
        currency: a.currency,
      }))}
      sessions={sessions}
      rules={rules}
    />
  );
}
