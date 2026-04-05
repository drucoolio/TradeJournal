/**
 * components/ui/index.tsx — Shared UI primitives.
 *
 * Reusable micro-components extracted from repeated patterns across
 * the codebase. Import from "@/components/ui" to use.
 *
 * These are all lightweight, zero-dependency components that handle
 * the visual patterns found throughout the trade journal UI.
 */

"use client";

import React from "react";

// ─── Status Badge ──────────────────────────────────────────────────
// Used in: TradeViewClient (trade table), TradeDetail (stats panel)

type TradeStatus = "WIN" | "LOSS" | "BE";

const STATUS_STYLES: Record<TradeStatus, string> = {
  WIN:  "bg-green-50 text-green-600",
  LOSS: "bg-red-50 text-red-600",
  BE:   "bg-blue-50 text-blue-600",
};

export function StatusBadge({ status }: { status: TradeStatus }) {
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

/** Derives trade status from net P&L value. Breakeven threshold: |pnl| <= $0.50 */
export function getTradeStatus(netPnl: number): TradeStatus {
  if (netPnl > 0.5) return "WIN";
  if (netPnl < -0.5) return "LOSS";
  return "BE";
}

// ─── Side Badge ────────────────────────────────────────────────────
// Used in: TradeViewClient, TradeDetail

export function SideBadge({ direction }: { direction: "buy" | "sell" }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
      direction === "buy"
        ? "bg-green-100 text-green-600"
        : "bg-red-100 text-red-600"
    }`}>
      {direction === "buy" ? "LONG" : "SHORT"}
    </span>
  );
}

// ─── Star Rating ───────────────────────────────────────────────────
// Used in: TradeViewClient (table), TradeDetail (stats panel)

export function StarRating({
  value,
  onChange,
  size = "sm",
  readonly = false,
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
  readonly?: boolean;
}) {
  const sizeClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(value === i ? 0 : i)}
          className={readonly ? "cursor-default" : "cursor-pointer"}
        >
          <svg
            className={`${sizeClass} ${i <= value ? "text-yellow-400" : "text-gray-200"}`}
            fill="currentColor" viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// Read-only star display (no buttons needed)
export function StarDisplay({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg
          key={i}
          className={`${sizeClass} ${i <= value ? "text-yellow-400" : "text-gray-200"}`}
          fill="currentColor" viewBox="0 0 24 24"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

// ─── Tag Chip ──────────────────────────────────────────────────────
// Used in: TradeDetail (setups, mistakes, custom tags, emotions)

export function TagChip({
  label,
  selected = false,
  onClick,
  color = "indigo",
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  color?: "indigo" | "blue" | "green" | "red" | "yellow" | "purple" | "gray";
}) {
  const colorMap: Record<string, { active: string; inactive: string }> = {
    indigo: { active: "bg-indigo-100 border-indigo-300 text-indigo-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
    blue:   { active: "bg-blue-100 border-blue-300 text-blue-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
    green:  { active: "bg-green-100 border-green-300 text-green-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
    red:    { active: "bg-red-100 border-red-300 text-red-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
    yellow: { active: "bg-yellow-100 border-yellow-300 text-yellow-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
    purple: { active: "bg-purple-100 border-purple-300 text-purple-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
    gray:   { active: "bg-gray-100 border-gray-300 text-gray-700", inactive: "bg-white border-gray-200 text-gray-500 hover:border-gray-300" },
  };

  const styles = colorMap[color] ?? colorMap.indigo;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded-full border transition font-medium ${
        selected ? styles.active : styles.inactive
      }`}
    >
      {label}
    </button>
  );
}

// ─── PnL Display ───────────────────────────────────────────────────
// Used in: TradeViewClient, overview page, TradeDetail

export function PnlText({
  value,
  className = "",
  prefix = "$",
}: {
  value: number;
  className?: string;
  prefix?: string;
}) {
  const isPositive = value >= 0;
  const colorClass = isPositive ? "text-green-600" : "text-red-600";
  return (
    <span className={`${colorClass} ${className}`}>
      {isPositive ? "" : "-"}{prefix}{Math.abs(value).toFixed(2)}
    </span>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────
// Used in: Overview page, Trade View page

export function StatCard({
  label,
  badge,
  children,
}: {
  label: string;
  badge?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs text-gray-400">{label}</p>
        {badge !== undefined && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
      <p className="text-gray-900 font-medium text-sm mb-1">{title}</p>
      {description && <p className="text-gray-400 text-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ─── Format Helpers ────────────────────────────────────────────────
// These were duplicated across TradeViewClient and TradeDetail

/** Format date to MM/DD/YYYY */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/** Format price with symbol-aware decimal places */
export function formatPrice(price: number | null, symbol: string): string {
  if (price === null || price === undefined) return "—";
  const s = (symbol ?? "").toUpperCase();
  if (s.includes("XAU") || s.includes("XAG")) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
  if (s.includes("BTC") || s.includes("ETH")) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (s.includes("JPY")) return price.toFixed(3);
  return price.toFixed(5);
}

/** Format money with currency symbol */
export function formatMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(n);
}
