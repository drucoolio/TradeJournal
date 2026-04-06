/**
 * components/tagCategories/useTagCategories.ts
 *
 * React hook that owns the user's tag_categories + tag_options state.
 *
 * One hook per page — the data is cached in this hook's state and mutated
 * through setter callbacks that hit /api/tag-categories and friends.
 *
 * The hook keeps options grouped by category_id in a Map so renderers can
 * do O(1) lookups without filtering on every paint.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TagCategory, TagOption, FieldType, CategoryConfig,
} from "@/lib/tagCategories/types";

interface ListResponse {
  categories: TagCategory[];
  options: TagOption[];
}

export function useTagCategories() {
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [options, setOptions] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const optionsByCategory = useMemo(() => {
    const m = new Map<string, TagOption[]>();
    for (const opt of options) {
      const list = m.get(opt.category_id) ?? [];
      list.push(opt);
      m.set(opt.category_id, list);
    }
    // Ensure each bucket is sorted by position.
    for (const [, list] of m) {
      list.sort((a, b) => a.position - b.position);
    }
    return m;
  }, [options]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tag-categories", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load categories (${res.status})`);
      const data = (await res.json()) as ListResponse;
      setCategories(data.categories ?? []);
      setOptions(data.options ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // -------- Category mutations --------

  const createCategory = useCallback(
    async (input: {
      name: string;
      field_type: FieldType;
      color?: string;
      icon?: string | null;
      config?: CategoryConfig;
    }) => {
      const res = await fetch("/api/tag-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        setError(`Create failed (${res.status})`);
        return null;
      }
      const { category } = (await res.json()) as { category: TagCategory };
      setCategories((prev) => [...prev, category].sort((a, b) => a.position - b.position));
      return category;
    },
    [],
  );

  const updateCategory = useCallback(
    async (id: string, patch: Partial<Pick<TagCategory, "name" | "color" | "icon" | "config" | "position">>) => {
      const res = await fetch("/api/tag-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        setError(`Update failed (${res.status})`);
        return null;
      }
      const { category } = (await res.json()) as { category: TagCategory };
      setCategories((prev) => prev.map((c) => (c.id === id ? category : c)));
      return category;
    },
    [],
  );

  const deleteCategory = useCallback(async (id: string) => {
    const res = await fetch("/api/tag-categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setError(`Delete failed (${res.status})`);
      return false;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setOptions((prev) => prev.filter((o) => o.category_id !== id));
    return true;
  }, []);

  const reorderCategories = useCallback(async (order: string[]) => {
    // Optimistic reorder: reindex locally first, then send the batch to the server.
    setCategories((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      return order
        .map((id, i) => {
          const row = byId.get(id);
          return row ? { ...row, position: i } : null;
        })
        .filter((x): x is TagCategory => x !== null);
    });
    const res = await fetch("/api/tag-categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    if (!res.ok) {
      setError(`Reorder failed (${res.status})`);
      await refresh();
      return false;
    }
    return true;
  }, [refresh]);

  // -------- Option mutations --------

  const createOption = useCallback(
    async (categoryId: string, label: string, color?: string) => {
      const res = await fetch(`/api/tag-categories/${categoryId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color }),
      });
      if (!res.ok) return null;
      const { option } = (await res.json()) as { option: TagOption };
      setOptions((prev) => [...prev, option]);
      return option;
    },
    [],
  );

  const updateOption = useCallback(
    async (categoryId: string, patch: { id: string; label?: string; color?: string; position?: number }) => {
      const res = await fetch(`/api/tag-categories/${categoryId}/options`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return null;
      const { option } = (await res.json()) as { option: TagOption };
      setOptions((prev) => prev.map((o) => (o.id === option.id ? option : o)));
      return option;
    },
    [],
  );

  const deleteOption = useCallback(
    async (categoryId: string, id: string) => {
      const res = await fetch(`/api/tag-categories/${categoryId}/options`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return false;
      setOptions((prev) => prev.filter((o) => o.id !== id));
      return true;
    },
    [],
  );

  const reorderOptions = useCallback(
    async (categoryId: string, order: string[]) => {
      setOptions((prev) => {
        const byId = new Map(prev.map((o) => [o.id, o]));
        const reindexed = order
          .map((id, i) => {
            const row = byId.get(id);
            return row ? { ...row, position: i } : null;
          })
          .filter((x): x is TagOption => x !== null);
        const untouched = prev.filter((o) => o.category_id !== categoryId);
        return [...untouched, ...reindexed];
      });
      const res = await fetch(`/api/tag-categories/${categoryId}/options/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) {
        await refresh();
        return false;
      }
      return true;
    },
    [refresh],
  );

  return {
    categories,
    options,
    optionsByCategory,
    loading,
    error,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    createOption,
    updateOption,
    deleteOption,
    reorderOptions,
  };
}
