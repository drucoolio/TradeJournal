/**
 * /api/tag-categories/reorder — batch position update.
 *
 * Body: { order: string[] }  — category IDs in the desired order.
 * Writes position=index back to every row that belongs to the user.
 *
 * Why a dedicated endpoint instead of N PUTs: drag-and-drop reorders touch
 * every row between the source and destination. One request = one network
 * round trip and one atomic update set on the client side.
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, ok, serverError } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const ctx = await apiAuth();
  if (!ctx) return unauthorized();
  const { userId, supa } = ctx;

  const { order } = (await req.json()) as { order?: string[] };
  if (!Array.isArray(order) || order.length === 0) {
    return badRequest("`order` must be a non-empty array of category IDs.");
  }

  // Issue one UPDATE per row. RLS guarantees we can only touch our own rows
  // and the payload per request is small (usually <20 categories per user),
  // so the overhead is negligible.
  const updates = order.map((id, index) =>
    supa
      .from("tag_categories")
      .update({ position: index, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId),
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) return serverError(firstError.error.message);

  return ok({ success: true });
}
