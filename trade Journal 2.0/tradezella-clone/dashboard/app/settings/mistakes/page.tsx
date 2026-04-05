/**
 * app/settings/mistakes/page.tsx — Mistake Library page (Server Component).
 *
 * Renders inside the Settings layout. Shows the user's mistake library —
 * a collection of common trading errors that can be tagged on individual
 * trades during post-trade journaling.
 *
 * The page fetches mistakes from the API (which auto-seeds defaults for
 * new users), then passes them to the MistakesManager client component
 * for interactive CRUD operations.
 *
 * ARCHITECTURE:
 *   Server Component (this file) → handles auth + initial data fetch
 *   Client Component (MistakesManager) → handles all interactive CRUD
 *
 * RELATED FILES:
 *   - /api/mistakes/route.ts — backend CRUD + default seeding
 *   - MistakesManager.tsx — client-side UI with create/edit/delete
 *   - 004_journal_system.sql — database schema (mistakes table)
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import type { MistakeData } from "@/lib/types";
import MistakesManager from "./MistakesManager";

export default async function MistakesPage() {
  // --- Auth gate: redirect unauthenticated users to login ---
  const user = await requireAuth();

  // --- Fetch mistakes for the current user ---
  // The API auto-seeds defaults for new users, but for the server component
  // initial render we fetch directly from the DB for speed. The API seeding
  // only triggers on the first client-side GET call if needed.
  const supa = serverClient();

  // Check if user has any mistakes — seed defaults if not
  const { count } = await supa
    .from("mistakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count === 0) {
    // Seed default mistakes for first-time users
    const defaults = [
      { user_id: user.id, name: "Moved stop loss",              description: "Moved stop loss further away from entry, increasing risk beyond the original plan.", is_default: true },
      { user_id: user.id, name: "Oversized position",           description: "Entered a position larger than the risk management rules allow.", is_default: true },
      { user_id: user.id, name: "FOMO entry",                   description: "Entered a trade out of fear of missing out, without proper setup confirmation.", is_default: true },
      { user_id: user.id, name: "Revenge trade",                description: "Took a trade to recover losses from a previous losing trade, bypassing normal analysis.", is_default: true },
      { user_id: user.id, name: "Traded against trend",         description: "Entered against the prevailing market trend without strong counter-trend setup.", is_default: true },
      { user_id: user.id, name: "Early exit",                   description: "Closed a winning trade too early, missing the majority of the planned move.", is_default: true },
      { user_id: user.id, name: "Didn't take profit at target", description: "Held past the planned take-profit level, giving back unrealized gains.", is_default: true },
      { user_id: user.id, name: "Entered too late",             description: "Entered after the optimal entry point, resulting in worse risk-reward ratio.", is_default: true },
      { user_id: user.id, name: "No stop loss",                 description: "Entered a trade without setting a stop loss, exposing the account to unlimited risk.", is_default: true },
      { user_id: user.id, name: "Broke max daily loss rule",    description: "Continued trading after hitting the maximum daily loss limit.", is_default: true },
      { user_id: user.id, name: "Traded during news",           description: "Took a trade during a high-impact news event without accounting for volatility.", is_default: true },
      { user_id: user.id, name: "Overtraded",                   description: "Took more trades than planned, often resulting in lower quality setups.", is_default: true },
    ];
    await supa.from("mistakes").upsert(defaults, { onConflict: "user_id,name" });
  }

  // Fetch all mistakes (including any just-seeded defaults)
  const { data: mistakes } = await supa
    .from("mistakes")
    .select("id, name, description, is_default, created_at")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  return (
    <div className="py-4 max-w-2xl">
      {/* Page header — matches the Tags management page style */}
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Mistake library</h2>
      <p className="text-xs text-gray-400 mb-6">
        Track common trading mistakes to identify patterns and improve discipline
      </p>

      {/* Client component handles all interactive CRUD operations */}
      <MistakesManager initialMistakes={(mistakes as MistakeData[]) ?? []} />
    </div>
  );
}
