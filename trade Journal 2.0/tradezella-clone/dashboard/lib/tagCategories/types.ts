/**
 * lib/tagCategories/types.ts
 *
 * Shared TypeScript types for the modular tag-category system.
 *
 * Mirrors the schema in supabase/migrations/008_modular_tag_categories.sql.
 * Each category has a `field_type` that determines:
 *   1. The shape of its `config` (per-category settings)
 *   2. The shape of its `value` payload in trade_category_values
 *
 * Keep these types in lockstep with the jsonb shapes documented in the
 * migration — if you add a new field type, update:
 *   - the CHECK constraint in 008_modular_tag_categories.sql
 *   - FieldType union below
 *   - the Config + Value discriminated unions below
 *   - the renderer registry in components/tagCategories/fields/
 */

// ------------------------------------------------------------
// Field type identifiers
// ------------------------------------------------------------
export type FieldType =
  | "multi_select"
  | "single_select"
  | "star_rating"
  | "slider"
  | "yes_no"
  | "short_text";

export const FIELD_TYPES: FieldType[] = [
  "multi_select",
  "single_select",
  "star_rating",
  "slider",
  "yes_no",
  "short_text",
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  multi_select: "Multi-select",
  single_select: "Single-select",
  star_rating: "Star rating",
  slider: "Slider / number",
  yes_no: "Yes / No",
  short_text: "Short text",
};

export const FIELD_TYPE_DESCRIPTIONS: Record<FieldType, string> = {
  multi_select: "Pick one or many from a list of options (e.g. Setups, Mistakes).",
  single_select: "Pick exactly one option from a list.",
  star_rating: "Rate from 1 to N stars (great for conviction or quality).",
  slider: "Numeric value within a range (great for R-multiple, %, volatility).",
  yes_no: "Simple boolean toggle.",
  short_text: "Free-form one-line text (great for catalyst, ticker notes).",
};

// ------------------------------------------------------------
// Per-field-type `config` shapes (stored in tag_categories.config jsonb)
// ------------------------------------------------------------
export interface MultiSelectConfig {
  // Options live in tag_options; no extra config today.
}

export interface SingleSelectConfig {
  // Options live in tag_options; no extra config today.
}

export interface StarRatingConfig {
  max: number; // default 5
}

export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  unit?: string; // e.g. "R", "%", "pips"
}

export interface YesNoConfig {
  true_label?: string; // default "Yes"
  false_label?: string; // default "No"
}

export interface ShortTextConfig {
  placeholder?: string;
}

export type CategoryConfig =
  | MultiSelectConfig
  | SingleSelectConfig
  | StarRatingConfig
  | SliderConfig
  | YesNoConfig
  | ShortTextConfig;

export const DEFAULT_CONFIG: Record<FieldType, CategoryConfig> = {
  multi_select: {},
  single_select: {},
  star_rating: { max: 5 },
  slider: { min: 0, max: 100, step: 1, unit: "" },
  yes_no: { true_label: "Yes", false_label: "No" },
  short_text: { placeholder: "" },
};

// ------------------------------------------------------------
// Row types (mirror DB rows)
// ------------------------------------------------------------
export interface TagCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string;
  field_type: FieldType;
  config: CategoryConfig;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TagOption {
  id: string;
  category_id: string;
  label: string;
  color: string;
  position: number;
  created_at: string;
}

// ------------------------------------------------------------
// Per-trade value payloads (stored in trade_category_values.value jsonb)
// ------------------------------------------------------------
export interface MultiSelectValue {
  option_ids: string[];
}

export interface SingleSelectValue {
  option_id: string | null;
}

export interface StarRatingValue {
  rating: number;
}

export interface SliderValue {
  number: number;
}

export interface YesNoValue {
  bool: boolean;
}

export interface ShortTextValue {
  text: string;
}

export type CategoryValuePayload =
  | MultiSelectValue
  | SingleSelectValue
  | StarRatingValue
  | SliderValue
  | YesNoValue
  | ShortTextValue;

export interface TradeCategoryValue {
  id: string;
  trade_id: string;
  category_id: string;
  value: CategoryValuePayload;
  updated_at: string;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Returns an empty/default value payload for a given field type. Useful when
 * a user first opens a category on a trade that has never been set.
 */
export function emptyValueFor(fieldType: FieldType, config: CategoryConfig): CategoryValuePayload {
  switch (fieldType) {
    case "multi_select":
      return { option_ids: [] };
    case "single_select":
      return { option_id: null };
    case "star_rating":
      return { rating: 0 };
    case "slider": {
      const cfg = config as SliderConfig;
      return { number: cfg.min ?? 0 };
    }
    case "yes_no":
      return { bool: false };
    case "short_text":
      return { text: "" };
  }
}

/**
 * Returns true if a value payload is "empty" — used to decide whether to
 * DELETE the row instead of UPSERTing it (keeps the table tidy).
 */
export function isEmptyValue(fieldType: FieldType, value: CategoryValuePayload): boolean {
  switch (fieldType) {
    case "multi_select":
      return (value as MultiSelectValue).option_ids.length === 0;
    case "single_select":
      return (value as SingleSelectValue).option_id == null;
    case "star_rating":
      return (value as StarRatingValue).rating === 0;
    case "slider":
      return false; // any number counts as "set"
    case "yes_no":
      return false; // bool is always considered set
    case "short_text":
      return (value as ShortTextValue).text.trim() === "";
  }
}
