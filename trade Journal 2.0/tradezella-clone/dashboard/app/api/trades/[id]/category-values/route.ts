/**
 * /api/trades/[id]/category-values — read + upsert per-trade category values.
 *
 * Each row in trade_category_values stores the answer for one tag_category
 * on one trade. The `value` column is jsonb whose shape depends on the
 * parent category's field_type (see lib/tagCategories/types.ts).
 *
 * ENDPOINTS:
 *   GET /api/trades/[id]/category-values
 *     → { values: TradeCategoryValue[] }
 *
 *   PUT /api/trades/[id]/category-values
 *     Body: { category_id, value }
 *     If value is "empty" for the category's field_type, the row is deleted.
 *     Otherwise UPSERT on (trade_id, category_id).
 */

import { NextRequest } from "next/server";
import {
  apiAuth, unauthorized, badRequest, ok, serverError,
} from "@/lib/api-helpers";
import {
  isEmptyValue, type CategoryValuePayload, type FieldType,
} from "@/lib/tagCategories/types";

type RouteCtx = { params: Promise<{ id: string }> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireOwnedTrade(supa: any, userId: string, tradeId: string) {
  const { data } = await supa
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? true : false;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id: tradeId } = await ctx.params;

  if (!(await requireOwnedTrade(supa, userId, tradeId))) {
    return ok({ error: "Not found" }, 404);
  }

  const { data, error } = await supa
    .from("trade_category_values")
    .select("id, trade_id, category_id, value, updated_at")
    .eq("trade_id", tradeId);

  if (error) return serverError(error.message);
  return ok({ values: data ?? [] });
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const auth = await apiAuth();
  if (!auth) return unauthorized();
  const { userId, supa } = auth;
  const { id: tradeId } = await ctx.params;

  if (!(await requireOwnedTrade(supa, userId, tradeId))) {
    return ok({ error: "Not found" }, 404);
  }

  const body = (await req.json()) as {
    category_id?: string;
    value?: CategoryValuePayload;
  };
  if (!body.category_id) return badRequest("category_id is required.");
  if (body.value == null) return badRequest("value is required.");

  // Load the parent category to know its field_type (needed for emptiness check)
  // and to enforce that it belongs to the same user.
  const { data: cat, error: catErr } = await supa
    .from("tag_categories")
    .select("id, field_type")
    .eq("id", body.category_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (catErr) return serverError(catErr.message);
  if (!cat) return ok({ error: "Category not found" }, 404);

  const fieldType = cat.field_type as FieldType;

  // If the value is "empty" (e.g. no options selected, no stars, blank text),
  // delete the row entirely so the UI can show the placeholder state without
  // phantom rows cluttering the table.
  if (isEmptyValue(fieldType, body.value)) {
    const { error } = await supa
      .from("trade_category_values")
      .delete()
      .eq("trade_id", tradeId)
      .eq("category_id", body.category_id);
    if (error) return serverError(error.message);
    return ok({ success: true, deleted: true });
  }

  const { data: row, error } = await supa
    .from("trade_category_values")
    .upsert(
      {
        trade_id:    tradeId,
        category_id: body.category_id,
        value:       body.value,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: "trade_id,category_id" },
    )
    .select("id, trade_id, category_id, value, updated_at")
    .single();

  if (error) return serverError(error.message);
  return ok({ value: row });
}
