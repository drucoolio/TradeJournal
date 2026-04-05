/**
 * app/journal/add-trade/page.tsx — Manual Trade Entry page (Server Component).
 *
 * Allows users to manually add trades that weren't captured by MT5 sync.
 * This is essential for:
 *   - Trades taken on platforms not connected to MT5
 *   - Paper trades or simulation entries for practice journaling
 *   - Historical trades imported from other brokers
 *   - Correcting trades that sync may have missed
 *
 * The page fetches the user's accounts (for the account selector),
 * active playbooks (for the strategy selector), and tags (for tagging),
 * then passes everything to the ManualTradeForm client component.
 *
 * ARCHITECTURE:
 *   Server Component (this file) → auth + data fetch
 *   Client Component (ManualTradeForm) → interactive form with validation
 *
 * RELATED FILES:
 *   - /api/trades/route.ts — POST endpoint for creating manual trades
 *   - ManualTradeForm.tsx — client-side form component
 *   - 004_journal_system.sql — adds source column + position_id sequence
 */

import { redirect } from "next/navigation";
import { createSupabaseServer, serverClient } from "@/lib/supabase";
import ManualTradeForm from "./ManualTradeForm";

export default async function AddTradePage() {
  // --- Auth gate ---
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const supa = serverClient();

  // Fetch user's accounts (for the account selector dropdown)
  const { data: accounts } = await supa
    .from("accounts")
    .select("id, login, name, broker, currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Fetch active playbooks (for the optional strategy selector)
  const { data: playbooks } = await supa
    .from("playbooks")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Fetch user's tags (for the tag selector)
  const { data: tags } = await supa
    .from("tags")
    .select("id, name, color, category")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Page header */}
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Add trade manually</h1>
      <p className="text-sm text-gray-400 mb-8">
        Enter a trade that wasn&apos;t captured by MT5 sync
      </p>

      <ManualTradeForm
        accounts={(accounts ?? []) as { id: string; login: number; name: string; broker: string; currency: string }[]}
        playbooks={(playbooks ?? []) as { id: string; name: string }[]}
        tags={(tags ?? []) as { id: string; name: string; color: string; category: string }[]}
      />
    </div>
  );
}
