/**
 * app/settings/tags/page.tsx — Tags management page (Server Component).
 *
 * Renders inside the Settings layout. Shows all user tags organized by category
 * with options to create, edit, and delete tags.
 *
 * Tags are the foundation of the journal system — used to categorize trades,
 * filter the dashboard, and power tag-based analytics (P&L per tag, win rate per tag).
 */

import { requireAuth } from "@/lib/auth";
import { serverClient } from "@/lib/supabase";
import type { TagData } from "@/lib/types";
import TagsManager from "./TagsManager";

export default async function TagsPage() {
  // Verify authentication
  const user = await requireAuth();

  // Fetch all tags for this user
  const supa = serverClient();
  const { data: tags } = await supa
    .from("tags")
    .select("id, name, color, category, created_at")
    .eq("user_id", user.id)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="py-4 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Tags management</h2>
      <p className="text-xs text-gray-400 mb-6">
        Create and organize tags to categorize your trades
      </p>

      <TagsManager initialTags={(tags as TagData[]) ?? []} />
    </div>
  );
}
