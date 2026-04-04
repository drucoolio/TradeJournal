/**
 * components/DashboardHeader.tsx — Date range + accounts filter dropdowns.
 *
 * Client Component because it needs:
 *   - useState for open/closed dropdown state
 *   - useRef for click-outside detection
 *   - useEffect for adding/removing the click-outside event listener
 *   - useRouter / useSearchParams for URL-based filter updates
 *
 * HOW FILTERING WORKS (important architectural decision):
 *   Filters are stored in URL search params rather than in React state.
 *   Changing a filter calls router.push() which triggers a Next.js navigation
 *   that re-renders the Server Component (overview/page.tsx) with the new params.
 *   No client-side data fetching needed — the server handles the query.
 *
 * ACCOUNTS PARAM FORMAT:
 *   ?accounts=login1,login2,login3  — comma-separated MT5 login numbers
 *   No param                         — "All accounts" (no filter = all data merged)
 *
 * MULTI-SELECT BEHAVIOUR (mirrors Tradezella):
 *   - "All accounts" checkbox at top: checked when no specific filter is active.
 *     Clicking it clears any specific selection → shows merged data.
 *   - Individual checkboxes: toggle each account in/out of the selection.
 *   - Toggling a single account when "All" is active deselects all others
 *     (i.e., selects all accounts EXCEPT the one just clicked).
 *   - If all accounts end up selected, the param is cleared (same as "All").
 *   - The dropdown stays open after each toggle so the user can pick multiple.
 *
 * BUTTON LABEL:
 *   All accounts → "All accounts" with people icon
 *   1 selected   → that account's name
 *   2+ selected  → comma-joined names, truncated to "N accounts" if > 30 chars
 */

"use client"; // Required: uses browser APIs and React hooks

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useRef, useEffect, useTransition } from "react";
import type { DbAccount } from "@/lib/db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Options for the date range filter dropdown */
const PERIOD_OPTIONS = [
  { value: "all",     label: "All time" },
  { value: "week",    label: "This week" },
  { value: "month",   label: "This month" },
  { value: "3months", label: "Last 3 months" },
  { value: "ytd",     label: "Year to date" },
];

/**
 * Color palette for account badges — 8 visually distinct colors.
 * Colors cycle for >8 accounts (index % 8).
 */
const ACCOUNT_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
];

/** Returns a deterministic color for an account based on its list index. */
function accountColor(index: number) {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
}

// ---------------------------------------------------------------------------
// useDropdown hook — shared click-outside-to-close logic
// ---------------------------------------------------------------------------

/**
 * Custom hook for dropdown open/close behaviour.
 * Returns { open, setOpen, ref } where ref must be attached to the dropdown
 * container div so click-outside detection works correctly.
 *
 * Uses mousedown (not click) so the dropdown closes before the click target's
 * own click handler fires, preventing accidental double-triggers.
 */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Close the dropdown if the click is outside the container
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // Only attach the listener when open — avoids unnecessary global listeners
    if (open) document.addEventListener("mousedown", handleClick);
    // Cleanup: always remove the listener to prevent memory leaks
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return { open, setOpen, ref };
}

// ---------------------------------------------------------------------------
// DateRangeDropdown — unchanged from before
// ---------------------------------------------------------------------------

/**
 * Date range filter dropdown. Updates ?period= URL param.
 * Preserves other params (e.g. ?accounts=) when updating the period.
 */
function DateRangeDropdown({ current }: { current: string }) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const { open, setOpen, ref } = useDropdown();

  const currentLabel = PERIOD_OPTIONS.find(p => p.value === current)?.label ?? "All time";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("period"); // "all" = no filter param
    else params.set("period", value);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200
                   bg-white rounded-lg px-3 py-2 hover:bg-gray-50 transition"
      >
        {/* Calendar icon */}
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {currentLabel}
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-gray-200
                        rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => select(opt.value)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs
                         text-gray-700 hover:bg-gray-50 transition"
            >
              {opt.label}
              {current === opt.value && (
                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccountsDropdown — multi-select with checkboxes
// ---------------------------------------------------------------------------

interface AccountsDropdownProps {
  accounts: DbAccount[];    // all accounts linked to the logged-in user
  selectedLogins: string[]; // currently selected MT5 login strings. Empty = "All accounts"
}

/**
 * Multi-select accounts dropdown with checkboxes.
 * Mirrors Tradezella's exact design and interaction model.
 *
 * State is encoded in ?accounts= URL param (comma-separated logins).
 * An empty/absent param means "All accounts" (no filter).
 */
function AccountsDropdown({ accounts, selectedLogins }: AccountsDropdownProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const { open, setOpen, ref } = useDropdown();

  // useTransition keeps the dropdown open during navigation.
  // Without this, router.push() triggers a server re-render that resets
  // the dropdown's open state before the new data arrives.
  const [, startTransition] = useTransition();

  // "All accounts" mode = no specific filter is active (param is absent or empty)
  const isAll = selectedLogins.length === 0;

  // ── Build the button label ──────────────────────────────────────────────
  // Shows the currently selected accounts in the trigger button.
  let triggerLabel: string;
  if (isAll) {
    triggerLabel = "All accounts";
  } else if (selectedLogins.length === 1) {
    // Single account: show its name (or login as fallback)
    const acc = accounts.find(a => String(a.login) === selectedLogins[0]);
    triggerLabel = acc?.name ?? `#${selectedLogins[0]}`;
  } else {
    // Multiple accounts: join names, fall back to "N accounts" if too long
    const names = selectedLogins.map(login => {
      const acc = accounts.find(a => String(a.login) === login);
      return acc?.name ?? `#${login}`;
    });
    const joined = names.join(", ");
    triggerLabel = joined.length > 28 ? `${selectedLogins.length} accounts` : joined;
  }

  // ── Toggle a specific account in/out of the selection ───────────────────
  /**
   * Adds or removes a single account from the selection.
   * If currently in "All accounts" mode, toggling one account means we want
   * all accounts EXCEPT the toggled one (i.e. select all others).
   *
   * If the result is "all accounts selected" or "none selected",
   * we clear the param (equivalent to "All accounts").
   *
   * The dropdown stays open after toggle so the user can pick multiple.
   */
  function toggleAccount(loginStr: string) {
    const params = new URLSearchParams(searchParams.toString());
    let newSelected: string[];

    if (isAll) {
      // Currently "All" — toggling one account means "select all EXCEPT this one"
      newSelected = accounts.map(a => String(a.login)).filter(l => l !== loginStr);
    } else if (selectedLogins.includes(loginStr)) {
      // Deselect: remove this login from the list
      newSelected = selectedLogins.filter(l => l !== loginStr);
    } else {
      // Select: add this login to the list
      newSelected = [...selectedLogins, loginStr];
    }

    // If all accounts are selected or none are, treat as "All accounts" (no filter)
    if (newSelected.length === 0 || newSelected.length === accounts.length) {
      params.delete("accounts");
    } else {
      params.set("accounts", newSelected.join(",")); // e.g. "330000,420000"
    }

    // Wrap in startTransition so React keeps the current UI (dropdown open)
    // while the server re-renders with the new filter params.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // ── Select all accounts (clear filter) ──────────────────────────────────
  /**
   * Clears the accounts param, returning to "All accounts" mode.
   * If already in "All accounts" mode this is a no-op (clicking a checked checkbox
   * shouldn't uncheck it when it would leave no accounts selected).
   * Keeps the dropdown open so the user can continue adjusting.
   */
  function selectAll() {
    if (isAll) return; // already in "All accounts" mode — nothing to do
    const params = new URLSearchParams(searchParams.toString());
    params.delete("accounts"); // remove filter → show all accounts
    // Wrap in startTransition to preserve the dropdown's open state
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // ── Determine the first selected account's color index for the trigger ──
  // Used to show the colored dot in the trigger button when a specific account is selected.
  const firstSelectedIndex = selectedLogins.length > 0
    ? accounts.findIndex(a => String(a.login) === selectedLogins[0])
    : -1;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200
                   bg-white rounded-lg px-3 py-2 hover:bg-gray-50 transition max-w-[200px]"
      >
        {/* Icon: people icon for "all", colored dot for specific selection */}
        {isAll ? (
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ) : (
          // Colored square badge representing the first selected account's color
          <span
            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ background: firstSelectedIndex >= 0 ? accountColor(firstSelectedIndex) : "#6366f1" }}
          />
        )}
        <span className="truncate">{triggerLabel}</span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-gray-200
                        rounded-xl shadow-lg z-50 overflow-hidden">

          {/* "All accounts" option — acts as "select all / clear filter" */}
          <div className="p-1">
            <button
              onClick={selectAll}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs
                         text-gray-700 hover:bg-gray-50 transition"
            >
              {/* Checkbox: checked when no specific filter is active */}
              <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center transition
                ${isAll
                  ? "bg-indigo-600 border-indigo-600"   // filled when "All accounts" is active
                  : "border-gray-300 bg-white"           // empty when specific accounts are selected
                }`}>
                {isAll && (
                  // Checkmark inside the filled checkbox
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              {/* People icon */}
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              All accounts
            </button>
          </div>

          {/* Individual accounts section */}
          {accounts.length > 0 && (
            <>
              {/* Section divider + label */}
              <div className="px-3 py-1.5 border-t border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  My accounts
                </p>
              </div>

              {/* Account checkboxes */}
              <div className="px-1 pb-1 space-y-0.5">
                {accounts.map((acc, i) => {
                  // Check if this account is in the current selection
                  // When in "All accounts" mode every account is implicitly selected,
                  // so all individual checkboxes should appear checked.
                  // When a specific subset is active, only those logins are checked.
                  const isChecked = isAll || selectedLogins.includes(String(acc.login));

                  // Truncate long account names to prevent layout overflow
                  const displayName = acc.name
                    ? acc.name.length > 26 ? acc.name.slice(0, 26) + "…" : acc.name
                    : `Account #${acc.login}`;

                  return (
                    <button
                      key={acc.id}
                      onClick={() => toggleAccount(String(acc.login))}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
                                 text-xs text-gray-700 hover:bg-gray-50 transition"
                    >
                      {/* Checkbox — filled (checked) or empty (unchecked) */}
                      <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center transition
                        ${isChecked
                          ? "bg-indigo-600 border-indigo-600" // checked state: indigo fill
                          : "border-gray-300 bg-white"         // unchecked state: empty
                        }`}>
                        {isChecked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>

                      {/* Colored square badge — deterministic color per account */}
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: accountColor(i) }}
                      />

                      <span className="truncate">{displayName}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* "Manage accounts" link — navigate to the accounts picker page */}
          <div className="border-t border-gray-100 px-1 py-1">
            <a
              href="/settings/accounts"
              onClick={() => setOpen(false)} // close dropdown on navigate
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500
                         hover:bg-gray-50 transition"
            >
              {/* Gear / settings icon */}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage accounts
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface Props {
  accounts: DbAccount[];    // all accounts linked to the logged-in user
  selectedLogins: string[]; // currently selected logins (empty = all)
  currentPeriod: string;    // active period filter key e.g. "month", "all"
}

/**
 * DashboardHeader — renders the date range and multi-select accounts dropdowns.
 * Both dropdowns update URL params which trigger server-side data re-fetching.
 */
export default function DashboardHeader({ accounts, selectedLogins, currentPeriod }: Props) {
  return (
    <div className="flex items-center gap-2">
      <DateRangeDropdown current={currentPeriod} />
      <AccountsDropdown accounts={accounts} selectedLogins={selectedLogins} />
    </div>
  );
}
