/**
 * /api/tag-categories/[id]/options/reorder — batch position update for options.
 *
 * Body: { order: string[] }  — option IDs in the desired order.
 */

import { NextRequest } from "next/server";
import { apiAuth, unauthorized, badRequest, ok, serverError } from "@/lib/api-helpers";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id: categoryId } = await ctx.params;

  // Verify ownership of the parent category.
  const { data: cat } = await supa
    .from("tag_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!cat) return ok({ error: "Not found" }, 404);

  const { order } = (await req.json()) as { order?: string[] };
  if (!Array.isArray(order) || order.length === 0) {
    return badRequest("`order` must be a non-empty array of option IDs.");
  }

  const updates = order.map((id, index) =>
    supa
      .from("tag_options")
      .update({ position: index })
      .eq("id", id)
      .eq("category_id", categoryId),
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) return serverError(firstError.error.message);

  return ok({ success: true });
}
