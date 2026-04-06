/**
 * components/templates/useTemplates.ts
 *
 * Thin client-side hook that wraps the /api/note-templates endpoints into a
 * single stateful store. Every template-aware surface (the modal, the in-editor
 * picker, the default-on-empty inserter) uses this — so cache invalidation
 * and mutation logic all live in one place.
 *
 * Pattern: load once on mount, mutate optimistically, refetch on 500.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { DbNoteTemplate, NoteKind, TipTapDoc } from "@/lib/editor/types";

interface ListResponse {
  templates: DbNoteTemplate[];
  favouriteIds: string[];
}

export interface UseTemplatesState {
  templates: DbNoteTemplate[];
  favouriteIds: Set<string>;
  loading: boolean;
  error: string | null;
}

export function useTemplates() {
  const [state, setState] = useState<UseTemplatesState>({
    templates: [],
    favouriteIds: new Set(),
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/note-templates", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as ListResponse;
      setState({
        templates: data.templates ?? [],
        favouriteIds: new Set(data.favouriteIds ?? []),
        loading: false,
        error: null,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load templates",
      }));
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: {
      name: string;
      content_json: TipTapDoc;
      content_html: string;
    }): Promise<DbNoteTemplate | null> => {
      try {
        const res = await fetch("/api/note-templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error("Create failed");
        const { template } = (await res.json()) as { template: DbNoteTemplate };
        setState((s) => ({ ...s, templates: [template, ...s.templates] }));
        return template;
      } catch (e) {
        console.error("[useTemplates create]", e);
        return null;
      }
    },
    [],
  );

  const update = useCallback(
    async (
      id: string,
      patch: Partial<{ name: string; content_json: TipTapDoc; content_html: string }>,
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/note-templates/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Update failed");
        const { template } = (await res.json()) as { template: DbNoteTemplate };
        setState((s) => ({
          ...s,
          templates: s.templates.map((t) => (t.id === id ? template : t)),
        }));
        return true;
      } catch (e) {
        console.error("[useTemplates update]", e);
        return false;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/note-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setState((s) => ({
        ...s,
        templates: s.templates.filter((t) => t.id !== id),
        favouriteIds: new Set(Array.from(s.favouriteIds).filter((x) => x !== id)),
      }));
      return true;
    } catch (e) {
      console.error("[useTemplates remove]", e);
      return false;
    }
  }, []);

  const toggleFavourite = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic flip
      let nextValue = false;
      setState((s) => {
        const fav = new Set(s.favouriteIds);
        if (fav.has(id)) fav.delete(id);
        else {
          fav.add(id);
          nextValue = true;
        }
        return { ...s, favouriteIds: fav };
      });
      try {
        await fetch(`/api/note-templates/${id}/favourite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: nextValue }),
        });
      } catch (e) {
        console.error("[useTemplates fav]", e);
        refetch();
      }
    },
    [refetch],
  );

  const setDefault = useCallback(
    async (id: string, kind: NoteKind, value: boolean): Promise<string | null> => {
      try {
        const res = await fetch(`/api/note-templates/${id}/default`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, value }),
        });
        if (!res.ok) throw new Error("Set default failed");
        const { id: targetId } = (await res.json()) as { id: string };
        // Default state lives on the row — refetch for correctness.
        await refetch();
        return targetId;
      } catch (e) {
        console.error("[useTemplates setDefault]", e);
        return null;
      }
    },
    [refetch],
  );

  const duplicate = useCallback(async (id: string): Promise<DbNoteTemplate | null> => {
    try {
      const res = await fetch(`/api/note-templates/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Duplicate failed");
      const { template } = (await res.json()) as { template: DbNoteTemplate };
      setState((s) => ({ ...s, templates: [template, ...s.templates] }));
      return template;
    } catch (e) {
      console.error("[useTemplates duplicate]", e);
      return null;
    }
  }, []);

  return {
    ...state,
    refetch,
    create,
    update,
    remove,
    toggleFavourite,
    setDefault,
    duplicate,
  };
}
