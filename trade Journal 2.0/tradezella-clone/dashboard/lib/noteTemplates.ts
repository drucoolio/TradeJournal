/**
 * lib/noteTemplates.ts — Note Template service layer.
 *
 * All business logic for the Note Templates feature lives here, so
 * API route handlers stay thin (auth → parse → call helper → respond).
 * Keeping this separate from the routes means:
 *   - the logic is unit-testable in isolation (no Request mocking)
 *   - adding a second transport later (GraphQL, tRPC, server actions)
 *     doesn't require rewriting anything
 *   - every mutation path is funnelled through one file, so audit /
 *     instrumentation / future features (e.g. activity log) only need
 *     to hook in here.
 *
 * All functions take a SupabaseClient as their first argument so the
 * caller chooses the RLS boundary (SSR client from apiAuth() in
 * production; service-role only for internal jobs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbNoteTemplate, NoteKind, TipTapDoc } from "./editor/types";

// ============================================================
// Read
// ============================================================

/**
 * Lists templates visible to the current user. Thanks to RLS, this
 * naturally returns the user's own rows plus any global Recommended
 * rows (user_id IS NULL). Callers split the result into sections in
 * the UI layer.
 */
export async function listTemplates(
  supa: SupabaseClient,
): Promise<DbNoteTemplate[]> {
  const { data, error } = await supa
    .from("note_templates")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DbNoteTemplate[];
}

/**
 * Returns the set of template IDs the given user has favourited.
 * Called separately from listTemplates so the UI can render the star
 * state without a join. Small table, fast query.
 */
export async function listFavouriteIds(
  supa: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supa
    .from("note_template_favourites")
    .select("template_id")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((r) => r.template_id as string);
}

/**
 * Returns the user's default template for a given kind, or null if
 * none is pinned. Used by the "open empty note → auto-insert default"
 * flow on the TradeJournalPanel and DailyJournal mount paths.
 */
export async function getDefaultTemplate(
  supa: SupabaseClient,
  userId: string,
  kind: NoteKind,
): Promise<DbNoteTemplate | null> {
  const column = kind === "trade" ? "is_default_trade" : "is_default_journal";
  const { data, error } = await supa
    .from("note_templates")
    .select("*")
    .eq("user_id", userId)
    .eq(column, true)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as DbNoteTemplate | null;
}

// ============================================================
// Write
// ============================================================

export interface CreateTemplateInput {
  name: string;
  content_json: TipTapDoc;
  content_html: string;
}

/** Creates a new template owned by the caller. */
export async function createTemplate(
  supa: SupabaseClient,
  userId: string,
  input: CreateTemplateInput,
): Promise<DbNoteTemplate> {
  const { data, error } = await supa
    .from("note_templates")
    .insert({
      user_id: userId,
      name: input.name,
      content_json: input.content_json,
      content_html: input.content_html,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as DbNoteTemplate;
}

export interface UpdateTemplateInput {
  name?: string;
  content_json?: TipTapDoc;
  content_html?: string;
}

/** Updates an existing template. RLS ensures only the owner can. */
export async function updateTemplate(
  supa: SupabaseClient,
  templateId: string,
  input: UpdateTemplateInput,
): Promise<DbNoteTemplate> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.content_json !== undefined) patch.content_json = input.content_json;
  if (input.content_html !== undefined) patch.content_html = input.content_html;

  const { data, error } = await supa
    .from("note_templates")
    .update(patch)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) throw error;
  return data as DbNoteTemplate;
}

/** Deletes a template. RLS blocks cross-user deletes. */
export async function deleteTemplate(
  supa: SupabaseClient,
  templateId: string,
): Promise<void> {
  const { error } = await supa
    .from("note_templates")
    .delete()
    .eq("id", templateId);

  if (error) throw error;
}

// ============================================================
// Defaults
// ============================================================

/**
 * Pin or unpin a template as the user's default for a given kind.
 *
 * IMPORTANT: Setting a default requires clearing any previously
 * pinned default of the same kind first — our partial unique index
 * enforces "at most one per (user_id, kind)" and the SQL would
 * otherwise raise a unique-violation error mid-transaction.
 *
 * The recommended template case (global, user_id is null) is
 * handled by the route layer: it first duplicates the row into the
 * user's library, then calls this helper with the new id.
 */
export async function setDefaultTemplate(
  supa: SupabaseClient,
  userId: string,
  templateId: string,
  kind: NoteKind,
  value: boolean,
): Promise<void> {
  const column = kind === "trade" ? "is_default_trade" : "is_default_journal";

  if (value) {
    // Clear any existing default of this kind for this user first.
    const { error: clearError } = await supa
      .from("note_templates")
      .update({ [column]: false })
      .eq("user_id", userId)
      .eq(column, true);
    if (clearError) throw clearError;
  }

  const { error } = await supa
    .from("note_templates")
    .update({ [column]: value })
    .eq("id", templateId);
  if (error) throw error;
}

// ============================================================
// Favourites
// ============================================================

/** Toggles (or explicitly sets) a favourite relationship. */
export async function setFavourite(
  supa: SupabaseClient,
  userId: string,
  templateId: string,
  value: boolean,
): Promise<void> {
  if (value) {
    const { error } = await supa
      .from("note_template_favourites")
      .insert({ user_id: userId, template_id: templateId });
    // Ignore unique-violation: re-favouriting is a no-op.
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supa
      .from("note_template_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("template_id", templateId);
    if (error) throw error;
  }
}

// ============================================================
// Duplicate
// ============================================================

/**
 * Copies an existing template (typically a global Recommended row)
 * into the caller's library. Returns the new row.
 *
 * Used when the user "Duplicates to my templates" from the modal, or
 * implicitly when they pin a Recommended template as their default.
 */
export async function duplicateTemplate(
  supa: SupabaseClient,
  userId: string,
  sourceId: string,
): Promise<DbNoteTemplate> {
  // Fetch the source (RLS grants read access to globals + own rows)
  const { data: source, error: fetchError } = await supa
    .from("note_templates")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (fetchError) throw fetchError;
  if (!source) throw new Error("Template not found");

  // Insert as a new row owned by the caller
  const { data, error } = await supa
    .from("note_templates")
    .insert({
      user_id: userId,
      name: `${source.name} (copy)`,
      content_json: source.content_json,
      content_html: source.content_html,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DbNoteTemplate;
}
