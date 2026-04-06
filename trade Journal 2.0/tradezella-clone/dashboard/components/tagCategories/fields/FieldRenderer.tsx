/**
 * components/tagCategories/fields/FieldRenderer.tsx
 *
 * Dispatches to the correct field UI based on a category's field_type.
 * Used by TradeCategoryPanel to render each category row for a trade.
 *
 * Every leaf field component has the SAME contract:
 *   - value:    the current CategoryValuePayload for this field type
 *   - onChange: called with the next payload (parent persists it)
 *   - category: the parent TagCategory (for config + options)
 *   - options:  the list of TagOption rows (only relevant for select types)
 *
 * A missing `value` means the trade has nothing stored for this category yet.
 */

"use client";

import type {
  TagCategory, TagOption, CategoryValuePayload,
  MultiSelectValue, SingleSelectValue, StarRatingValue,
  SliderValue, YesNoValue, ShortTextValue,
  StarRatingConfig, SliderConfig, YesNoConfig, ShortTextConfig,
} from "@/lib/tagCategories/types";
import { emptyValueFor } from "@/lib/tagCategories/types";

interface Props {
  category: TagCategory;
  options: TagOption[];
  value: CategoryValuePayload | null;
  onChange: (next: CategoryValuePayload) => void;
}

export default function FieldRenderer({ category, options, value, onChange }: Props) {
  const v = value ?? emptyValueFor(category.field_type, category.config);

  switch (category.field_type) {
    case "multi_select":
      return (
        <MultiSelectField
          options={options}
          value={v as MultiSelectValue}
          onChange={onChange}
        />
      );
    case "single_select":
      return (
        <SingleSelectField
          options={options}
          value={v as SingleSelectValue}
          onChange={onChange}
        />
      );
    case "star_rating":
      return (
        <StarRatingField
          config={category.config as StarRatingConfig}
          value={v as StarRatingValue}
          onChange={onChange}
        />
      );
    case "slider":
      return (
        <SliderField
          config={category.config as SliderConfig}
          value={v as SliderValue}
          onChange={onChange}
        />
      );
    case "yes_no":
      return (
        <YesNoField
          config={category.config as YesNoConfig}
          value={v as YesNoValue}
          onChange={onChange}
        />
      );
    case "short_text":
      return (
        <ShortTextField
          config={category.config as ShortTextConfig}
          value={v as ShortTextValue}
          onChange={onChange}
        />
      );
  }
}

// ------------------------------------------------------------
// Multi-select: pill checkboxes
// ------------------------------------------------------------
function MultiSelectField({
  options, value, onChange,
}: {
  options: TagOption[];
  value: MultiSelectValue;
  onChange: (next: MultiSelectValue) => void;
}) {
  const selected = new Set(value.option_ids);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ option_ids: Array.from(next) });
  };
  if (options.length === 0) {
    return <div className="text-xs text-gray-400">No options yet. Add some in settings.</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const isOn = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            className={[
              "rounded-full border px-2.5 py-1 text-xs transition",
              isOn
                ? "border-transparent text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            ].join(" ")}
            style={isOn ? { backgroundColor: o.color } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Single-select: radio-style pills
// ------------------------------------------------------------
function SingleSelectField({
  options, value, onChange,
}: {
  options: TagOption[];
  value: SingleSelectValue;
  onChange: (next: SingleSelectValue) => void;
}) {
  if (options.length === 0) {
    return <div className="text-xs text-gray-400">No options yet. Add some in settings.</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const isOn = value.option_id === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange({ option_id: isOn ? null : o.id })}
            className={[
              "rounded-full border px-2.5 py-1 text-xs transition",
              isOn
                ? "border-transparent text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            ].join(" ")}
            style={isOn ? { backgroundColor: o.color } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Star rating
// ------------------------------------------------------------
function StarRatingField({
  config, value, onChange,
}: {
  config: StarRatingConfig;
  value: StarRatingValue;
  onChange: (next: StarRatingValue) => void;
}) {
  const max = Math.max(1, Math.min(10, config.max ?? 5));
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        const active = n <= value.rating;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange({ rating: value.rating === n ? 0 : n })}
            className={[
              "p-0.5 transition",
              active ? "text-amber-400" : "text-gray-300 hover:text-amber-300",
            ].join(" ")}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.5l7.1-.6L12 2z" />
            </svg>
          </button>
        );
      })}
      {value.rating > 0 && (
        <span className="ml-1 text-xs text-gray-500">{value.rating}/{max}</span>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Slider / number
// ------------------------------------------------------------
function SliderField({
  config, value, onChange,
}: {
  config: SliderConfig;
  value: SliderValue;
  onChange: (next: SliderValue) => void;
}) {
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const step = config.step ?? 1;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value.number}
        onChange={(e) => onChange({ number: Number(e.target.value) })}
        className="h-1.5 flex-1 min-w-[140px] accent-indigo-600"
      />
      <input
        type="number"
        value={value.number}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange({ number: Number(e.target.value) })}
        className="w-16 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-right text-xs text-gray-800"
      />
      {config.unit && <span className="text-xs text-gray-500">{config.unit}</span>}
    </div>
  );
}

// ------------------------------------------------------------
// Yes / No toggle
// ------------------------------------------------------------
function YesNoField({
  config, value, onChange,
}: {
  config: YesNoConfig;
  value: YesNoValue;
  onChange: (next: YesNoValue) => void;
}) {
  const trueLabel = config.true_label ?? "Yes";
  const falseLabel = config.false_label ?? "No";
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange({ bool: true })}
        className={[
          "rounded-full px-2.5 py-0.5 transition",
          value.bool ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100",
        ].join(" ")}
      >
        {trueLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange({ bool: false })}
        className={[
          "rounded-full px-2.5 py-0.5 transition",
          !value.bool ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100",
        ].join(" ")}
      >
        {falseLabel}
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// Short text
// ------------------------------------------------------------
function ShortTextField({
  config, value, onChange,
}: {
  config: ShortTextConfig;
  value: ShortTextValue;
  onChange: (next: ShortTextValue) => void;
}) {
  return (
    <input
      type="text"
      value={value.text}
      onChange={(e) => onChange({ text: e.target.value })}
      placeholder={config.placeholder ?? "Type a note…"}
      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
    />
  );
}
