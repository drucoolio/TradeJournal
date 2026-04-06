/**
 * components/tagCategories/TradeCategoryPanel.tsx
 *
 * Renders every user-defined category as a row on the Trade Detail page,
 * letting the user answer each one. This is the replacement for the old
 * hard-coded "Tags" textarea / multiselect.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Setups             [ breakout ] [ trend follow ]   │
 *   │  Mistakes           [ revenge ] [ over-sized ]      │
 *   │  Conviction         ★★★★☆                            │
 *   │  R target           ─────●────  2R                  │
 *   │  News day           [ Yes | No ]                    │
 *   │  Catalyst           CPI print                       │
 *   └──────────────────────────────────────────────────────┘
 */

"use client";

import Link from "next/link";
import FieldRenderer from "./fields/FieldRenderer";
import { useTagCategories } from "./useTagCategories";
import { useTradeCategoryValues } from "./useTradeCategoryValues";

interface Props {
  tradeId: string;
}

export default function TradeCategoryPanel({ tradeId }: Props) {
  const store = useTagCategories();
  const { values, loading: valLoading, setValue } = useTradeCategoryValues(tradeId);

  if (store.loading || valLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
        Loading tags…
      </div>
    );
  }

  if (store.categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-xs text-gray-500">
        No tag categories yet.{" "}
        <Link href="/settings/tag-categories" className="text-indigo-600 underline">
          Create your first one
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="divide-y divide-gray-100">
        {store.categories.map((cat) => (
          <div
            key={cat.id}
            className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="flex items-center gap-2 sm:w-44 sm:flex-none">
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-xs font-medium text-gray-700">{cat.name}</span>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRenderer
                category={cat}
                options={store.optionsByCategory.get(cat.id) ?? []}
                value={values[cat.id] ?? null}
                onChange={(next) => setValue(cat.id, next)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50 px-4 py-2">
        <Link
          href="/settings/tag-categories"
          className="text-[11px] text-gray-500 hover:text-indigo-600"
        >
          Manage categories →
        </Link>
      </div>
    </div>
  );
}
