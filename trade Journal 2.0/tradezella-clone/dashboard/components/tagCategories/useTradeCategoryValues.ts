/**
 * components/tagCategories/useTradeCategoryValues.ts
 *
 * Owns the `trade_category_values` rows for a single trade. The hook exposes
 * a map of category_id → CategoryValuePayload and a setValue() callback that
 * optimistically updates the map, then persists via the upsert API.
 *
 * Each PUT is fire-and-forget — we debounce a little so rapid toggles on a
 * multi-select pill set don't hammer the server.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryValuePayload, TradeCategoryValue } from "@/lib/tagCategories/types";

export function useTradeCategoryValues(tradeId: string | null) {
  const [values, setValues] = useState<Record<string, CategoryValuePayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!tradeId) {
      setValues({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/trades/${tradeId}/category-values`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load values (${res.status})`);
        const data = (await res.json()) as { values: TradeCategoryValue[] };
        if (cancelled) return;
        const next: Record<string, CategoryValuePayload> = {};
        for (const row of data.values ?? []) {
          next[row.category_id] = row.value;
        }
        setValues(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  const setValue = useCallback(
    (categoryId: string, next: CategoryValuePayload) => {
      // Optimistic update.
      setValues((prev) => ({ ...prev, [categoryId]: next }));

      if (!tradeId) return;

      // Debounce per-category: 300ms is short enough to feel live and long
      // enough to coalesce a flurry of clicks.
      const existing = pendingTimers.current.get(categoryId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        pendingTimers.current.delete(categoryId);
        try {
          const res = await fetch(`/api/trades/${tradeId}/category-values`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category_id: categoryId, value: next }),
          });
          if (!res.ok) {
            setError(`Save failed (${res.status})`);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }, 300);
      pendingTimers.current.set(categoryId, timer);
    },
    [tradeId],
  );

  // Clean up pending timers on unmount.
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return { values, loading, error, setValue };
}
