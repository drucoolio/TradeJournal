/**
 * lib/types.ts — Shared type definitions for the journal system.
 *
 * Centralizes all entity types that were previously scattered across
 * individual page.tsx files. Import from here instead of from pages.
 */

// ─── Tags ─────────────────────────────────────────────────────────
export interface TagData {
  id: string;
  name: string;
  color: string;
  category: string;
  created_at: string;
}

// ─── Mistakes ─────────────────────────────────────────────────────
export interface MistakeData {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

// ─── Rules ────────────────────────────────────────────────────────
export interface RuleData {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Playbooks ────────────────────────────────────────────────────
export interface PlaybookData {
  id: string;
  name: string;
  description: string | null;
  entry_rules: string | null;
  exit_rules: string | null;
  ideal_conditions: string | null;
  timeframes: string[];
  default_rr: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Accounts ─────────────────────────────────────────────────────
export interface AccountRowData {
  credId: string;
  login: number;
  server: string;
  label: string;
  createdAt: string;
  accountId: string | null;
  name: string | null;
  currency: string | null;
  balance: number | null;
  updatedAt: string | null;
  tradeCount: number;
}
