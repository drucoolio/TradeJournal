/**
 * app/strategies/page.tsx — Strategy Playbooks page (Server Component).
 *
 * Top-level route accessible from the main sidebar. Shows the user's
 * strategy playbook library — detailed trading strategy definitions
 * that can be linked to individual trades for per-strategy analytics.
 *
 * ARCHITECTURE:
 *   Server Component (this file) → auth check + initial data fetch
 *   Client Component (PlaybooksManager) → interactive CRUD UI
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import type { PlaybookData } from "@/lib/types";
import PlaybooksManager from "./PlaybooksManager";

export default async function StrategiesPage() {
  // --- Auth gate ---
  const user = await requireAuth();

  // --- Fetch all playbooks for the current user ---
  const supa = serverClient();
  const { data: playbooks } = await supa
    .from("playbooks")
    .select("id, name, description, entry_rules, exit_rules, ideal_conditions, timeframes, default_rr, is_active, created_at, updated_at")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  return (
    <div className="py-5 px-5">
      {/* Page header */}
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Strategies</h1>
      <p className="text-xs text-gray-400 mb-6">
        Define your trading strategies to link them to trades and track per-strategy performance
      </p>

      {/* Client component handles all interactive CRUD operations */}
      <div className="max-w-3xl">
        <PlaybooksManager initialPlaybooks={(playbooks as PlaybookData[]) ?? []} />
      </div>
    </div>
  );
}
