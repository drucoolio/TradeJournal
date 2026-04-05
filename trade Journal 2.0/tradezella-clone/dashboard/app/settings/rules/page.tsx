/**
 * app/settings/rules/page.tsx — Trading Rules page (Server Component).
 *
 * Renders inside the Settings layout. Shows the user's personal trading
 * rules — discipline-focused guidelines they set for themselves.
 *
 * Rules serve two roles in the journal system:
 *   1. They appear as a pre-session checklist in the daily journal,
 *      helping the user commit to their discipline before trading.
 *   2. The daily journal records which rules were followed/broken,
 *      enabling long-term discipline analytics.
 *
 * Active rules appear in the daily checklist; inactive rules are
 * preserved for historical data but hidden from the checklist.
 *
 * ARCHITECTURE:
 *   Server Component (this file) → auth check + initial data fetch
 *   Client Component (RulesManager) → interactive CRUD with /api/rules
 *
 * RELATED FILES:
 *   - /api/rules/route.ts — backend CRUD endpoints
 *   - RulesManager.tsx — client-side management UI
 *   - 004_journal_system.sql — database schema (rules table)
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import type { RuleData } from "@/lib/types";
import RulesManager from "./RulesManager";

export default async function RulesPage() {
  // --- Auth gate: redirect unauthenticated users to login ---
  const user = await requireAuth();

  // --- Fetch all rules for the current user ---
  // Ordered: active rules first, then alphabetically by name
  const supa = serverClient();
  const { data: rules } = await supa
    .from("rules")
    .select("id, name, description, is_active, created_at")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  return (
    <div className="py-4 max-w-2xl">
      {/* Page header — consistent with Tags and Mistakes page styling */}
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Trading rules</h2>
      <p className="text-xs text-gray-400 mb-6">
        Define your personal trading rules to track discipline in your daily journal
      </p>

      {/* Client component handles all interactive CRUD operations */}
      <RulesManager initialRules={(rules as RuleData[]) ?? []} />
    </div>
  );
}
