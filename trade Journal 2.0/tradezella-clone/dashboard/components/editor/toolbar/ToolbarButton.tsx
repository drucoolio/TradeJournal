/**
 * components/editor/toolbar/ToolbarButton.tsx
 *
 * Reusable primitive for every toolbar button. Centralising this here means
 * the whole toolbar has consistent hover/active/disabled styling — and if
 * we ever tweak the look we only touch one file.
 *
 * Every real button (Bold, Italic, HeadingMenu trigger, etc.) composes this.
 */

"use client";

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";

export interface ToolbarButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string; // accessible label (also used as title tooltip)
  children: ReactNode;
}

const base =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-transparent px-2 text-xs font-medium text-gray-600 transition";
const inactive = "hover:bg-gray-100 hover:text-gray-900";
const activeCls = "bg-indigo-50 border-indigo-200 text-indigo-700";
const disabledCls = "opacity-40 pointer-events-none";

const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton({ active, label, disabled, children, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={active}
        disabled={disabled}
        className={[
          base,
          active ? activeCls : inactive,
          disabled ? disabledCls : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        onMouseDown={(e) => {
          // Prevent TipTap from losing selection when the button is clicked.
          e.preventDefault();
          rest.onMouseDown?.(e);
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export default ToolbarButton;
