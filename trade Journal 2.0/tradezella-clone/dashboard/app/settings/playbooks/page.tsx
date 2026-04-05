/**
 * app/settings/playbooks/page.tsx — Playbook Library page (Server Component).
 *
 * Renders inside the Settings layout. Shows the user's strategy playbook
 * library — detailed trading strategy definitions that can be linked to
 * individual trades for per-strategy analytics.
 *
 * Playbooks are the bridge between "what happened" (trade data) and
 * "what was the plan" (strategy definition). By linking trades to playbooks,
 * the analytics engine can answer questions like:
 *   - Which strategy has the highest win rate?
 *   - What's the average R:R achieved per strategy?
 *   - Am I following my own entry/exit rules?
 *
 * ARCHITECTURE:
 *   Server Component (this file) → auth check + initial data fetch
 *   Client Component (PlaybooksManager) → interactive CRUD UI
 *
 * RELATED FILES:
 *   - /api/playbooks/route.ts — backend CRUD endpoints
 *   - PlaybooksManager.tsx — client-side management UI
 *   - 004_journal_system.sql — database schema (playbooks table)
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import type { PlaybookData } from "@/lib/types";
import PlaybooksManager from "./PlaybooksManager";

export default async function PlaybooksPage() {
  // --- Auth gate: redirect unauthenticated users to login ---
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
    <div className="py-4 max-w-3xl">
      {/* Page header */}
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Strategy playbooks</h2>
      <p className="text-xs text-gray-400 mb-6">
        Define your trading strategies to link them to trades and track per-strategy performance
      </p>

      {/* Client component handles all interactive CRUD operations */}
      <PlaybooksManager initialPlaybooks={(playbooks as PlaybookData[]) ?? []} />
    </div>
  );
}
