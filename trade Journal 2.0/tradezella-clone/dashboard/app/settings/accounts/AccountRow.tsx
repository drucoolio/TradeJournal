/**
 * app/settings/accounts/AccountRow.tsx — Single row in the accounts table.
 *
 * Client Component because it needs:
 *   - onClick to select account (POST /api/select-account → redirect to dashboard)
 *   - onClick to trigger sync (POST /api/sync → refresh page)
 *   - useState for loading/error feedback
 *
 * COLUMNS RENDERED:
 *   1. Account name — clickable label + login number, selects the account
 *   2. Broker — MT5 icon + "MetaTrader 5"
 *   3. Balance — formatted currency, blue link-style text
 *   4. Profit calculation method — "FIFO" (all MT5 accounts use this)
 *   5. Last update — formatted timestamp from last sync
 *   6. Type — "Auto sync" badge (or "Manual" if never synced)
 *   7. Actions — sync button + three-dot menu (placeholder)
 *
 * ACCOUNT SELECTION:
 *   Clicking the account name POSTs to /api/select-account, which reconnects
 *   the VPS session to this account and sets the mt5_account cookie.
 *   On success, navigates to /overview (the dashboard).
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AccountRowData } from "./page";

/**
 * Formats an ISO timestamp to a localized date + time string.
 * Returns "-" if the timestamp is null (account never synced).
 */
function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats a number as currency (e.g. "$2,440.74").
 * Returns "-" if the value is null (never synced).
 */
function formatBalance(balance: number | null, currency: string | null): string {
  if (balance == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    minimumFractionDigits: 2,
  }).format(balance);
}

export default function AccountRow({ row }: { row: AccountRowData }) {
  const router = useRouter();

  // Loading states for account selection and sync operations
  const [selecting, setSelecting] = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState("");

  // Three-dot actions dropdown — open/close state + click-outside detection
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside of it (uses mousedown like DashboardHeader)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // ── Confirmation modal state ─────────────────────────────────────────────
  // Controls which destructive action modal is shown (null = no modal open).
  // The modal requires the user to type a confirmation phrase before proceeding.
  const [modal, setModal] = useState<"clear-trades" | "delete-account" | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError]     = useState("");

  // Display name: user label → MT5 name → fallback to login number
  const displayName = row.label || row.name || `Account #${row.login}`;

  /**
   * Selects this account for the dashboard.
   * POSTs to /api/select-account which reconnects VPS and sets the session cookie.
   */
  async function handleSelect() {
    if (selecting) return;
    setSelecting(true);
    setError("");

    try {
      const res = await fetch("/api/select-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: row.login }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to connect");

      // Navigate to dashboard — server set the mt5_account cookie
      router.push("/overview");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setSelecting(false);
    }
  }

  /**
   * Triggers a sync for this specific account.
   * POSTs to /api/sync which pulls latest trades from VPS into Supabase.
   * On success, refreshes the page to show updated "Last update" timestamp.
   *
   * Handles 429 (rate limit) responses by showing a friendly countdown message
   * instead of a generic error. The API returns waitSeconds so we know exactly
   * how long the user needs to wait.
   */
  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setError("");

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      // Handle rate limit response (429) — show friendly wait message
      if (res.status === 429) {
        const mins = data.waitSeconds ? Math.ceil(data.waitSeconds / 60) : 15;
        setError(`Sync available in ${mins} min${mins === 1 ? "" : "s"}`);
        return;
      }

      if (!res.ok) throw new Error(data.error ?? "Sync failed");

      // Refresh the server component to update the "Last update" column
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Handles the "Clear trades" destructive action.
   * Sends DELETE to /api/account/clear-trades with the account ID.
   * On success, refreshes the page so trade counts update.
   */
  async function handleClearTrades() {
    if (!row.accountId) return;
    setModalLoading(true);
    setModalError("");

    try {
      const res = await fetch("/api/account/clear-trades", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: row.accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clear trades");

      // Close modal and refresh the page to reflect the cleared data
      setModal(null);
      router.refresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setModalLoading(false);
    }
  }

  /**
   * Handles the "Delete account" destructive action.
   * Sends DELETE to /api/account/delete with account ID and login number.
   * On success, refreshes the page so the deleted account disappears from the table.
   */
  async function handleDeleteAccount() {
    setModalLoading(true);
    setModalError("");

    try {
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: row.accountId, login: row.login }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete account");

      // Close modal and refresh — the row will disappear from the table
      setModal(null);
      router.refresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setModalLoading(false);
    }
  }

  return (
    <>
    {/* ── Confirmation modal (rendered as a portal-style overlay) ──────── */}
    {modal === "clear-trades" && (
      <ConfirmModal
        title="Warning: this can't be undone."
        description={`Clear trades from ${displayName}? All tags, trades, notes will be destroyed.`}
        confirmPhrase="CLEAR ALL TRADES"
        confirmLabel="I'M SURE, CLEAR ALL TRADES"
        loading={modalLoading}
        error={modalError}
        onConfirm={handleClearTrades}
        onClose={() => { setModal(null); setModalError(""); }}
      />
    )}
    {modal === "delete-account" && (
      <ConfirmModal
        title={`Delete ${displayName}?`}
        description={`This account has ${row.tradeCount} trades. Are you sure?`}
        confirmPhrase={`DELETE ACCOUNT WITH ${row.tradeCount} TRADES`}
        confirmLabel="I'M SURE, DELETE MY ACCOUNT"
        loading={modalLoading}
        error={modalError}
        onConfirm={handleDeleteAccount}
        onClose={() => { setModal(null); setModalError(""); }}
      />
    )}

    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition">
      {/* Account name — clickable, selects the account and navigates to dashboard */}
      <td className="px-4 py-3">
        <button
          onClick={handleSelect}
          disabled={selecting}
          className="text-left group"
        >
          <span className="text-sm text-gray-900 font-medium group-hover:text-indigo-600 transition">
            {selecting ? "Connecting…" : displayName}
          </span>
          <span className="block text-xs text-gray-400 mt-0.5">#{row.login}</span>
        </button>
        {/* Inline error — shown below the account name if selection/sync fails */}
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </td>

      {/* Broker — MT5 icon + "MetaTrader 5" */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {/* MT5 logo placeholder — orange/green triangle icon */}
          <div className="w-5 h-5 rounded flex items-center justify-center bg-amber-50 flex-shrink-0">
            <svg className="w-3 h-3 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 22h20L12 2zm0 4l7.5 14h-15L12 6z" />
            </svg>
          </div>
          <span className="text-sm text-gray-700">MetaTrader 5</span>
        </div>
      </td>

      {/* Balance — blue link-style text */}
      <td className="px-4 py-3">
        <span className="text-sm text-blue-600">
          {formatBalance(row.balance, row.currency)}
        </span>
      </td>

      {/* Profit calculation method — always FIFO for MT5 */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-700">FIFO</span>
      </td>

      {/* Last update — formatted sync timestamp */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-500">{formatDate(row.updatedAt)}</span>
      </td>

      {/* Type — "Auto sync" badge with status color */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Auto sync</span>
          {/* Status badge: green if recently synced, gray if never synced */}
          {row.updatedAt ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-600">
              Active
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              Pending
            </span>
          )}
        </div>
      </td>

      {/* Actions — sync button + menu */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Sync button — triggers a manual re-sync of this account */}
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sync now"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600
                       disabled:opacity-50 transition"
          >
            <svg
              className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Three-dot actions menu — dropdown with account management options */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              title="More options"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {/* Dropdown panel — positioned to the left so it doesn't overflow the table */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200
                              rounded-xl shadow-lg z-50 py-1 overflow-hidden">

                {/* Edit — rename the account label */}
                <MenuButton
                  icon={<PencilIcon />}
                  label="Edit"
                  onClick={() => { setMenuOpen(false); /* TODO: open edit modal */ }}
                />

                {/* File upload — import trades from a file */}
                <MenuButton
                  icon={<UploadIcon />}
                  label="File upload"
                  onClick={() => { setMenuOpen(false); /* TODO: file upload flow */ }}
                />

                {/* Manual upload — manually enter trade data */}
                <MenuButton
                  icon={<PlusIcon />}
                  label="Manual upload"
                  onClick={() => { setMenuOpen(false); /* TODO: manual upload form */ }}
                />

                {/* Update sync — reconfigure sync settings */}
                <MenuButton
                  icon={<SyncIcon />}
                  label="Update sync"
                  onClick={() => { setMenuOpen(false); /* TODO: sync settings modal */ }}
                />

                {/* Remove sync — disconnect auto-sync for this account */}
                <MenuButton
                  icon={<UnlinkIcon />}
                  label="Remove sync"
                  onClick={() => { setMenuOpen(false); /* TODO: confirm remove sync */ }}
                />

                {/* Edit balance — manually adjust the account balance */}
                <MenuButton
                  icon={<CurrencyIcon />}
                  label="Edit balance"
                  onClick={() => { setMenuOpen(false); /* TODO: balance edit modal */ }}
                />

                {/* Transfer data — move trades between accounts */}
                <MenuButton
                  icon={<TransferIcon />}
                  label="Transfer data"
                  onClick={() => { setMenuOpen(false); /* TODO: transfer data flow */ }}
                />

                {/* Archive account — hide from active list without deleting */}
                <MenuButton
                  icon={<ArchiveIcon />}
                  label="Archive account"
                  onClick={() => { setMenuOpen(false); /* TODO: archive confirmation */ }}
                />

                {/* Divider before destructive actions */}
                <div className="border-t border-gray-100 my-1" />

                {/* Clear trades — opens confirmation modal before deleting */}
                <MenuButton
                  icon={<TrashIcon className="text-red-500" />}
                  label="Clear trades"
                  destructive
                  onClick={() => { setMenuOpen(false); setModal("clear-trades"); }}
                />

                {/* Delete account — opens confirmation modal before deleting */}
                <MenuButton
                  icon={<DeleteIcon className="text-red-500" />}
                  label="Delete account"
                  destructive
                  onClick={() => { setMenuOpen(false); setModal("delete-account"); }}
                />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
    </>
  );
}

// ---------------------------------------------------------------------------
// ConfirmModal — Tradezella-style destructive action confirmation
// ---------------------------------------------------------------------------

/**
 * Full-screen overlay modal that requires the user to type a confirmation phrase
 * before a destructive action (clear trades, delete account) is executed.
 *
 * Mirrors Tradezella's design:
 *   - Centered white card over a dark semi-transparent backdrop
 *   - Warning text explaining what will happen
 *   - Text input that must exactly match `confirmPhrase` (case-sensitive)
 *   - Submit button that stays disabled until the phrase matches
 *   - X button to dismiss without taking action
 */
function ConfirmModal({
  title,
  description,
  confirmPhrase,
  confirmLabel,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  title: string;          // bold heading text (e.g. "Warning: this can't be undone.")
  description: string;    // explanatory text below the title
  confirmPhrase: string;  // exact string the user must type (e.g. "CLEAR ALL TRADES")
  confirmLabel: string;   // button text (e.g. "I'M SURE, CLEAR ALL TRADES")
  loading: boolean;       // disables button and shows spinner while API call runs
  error: string;          // error message from failed API call
  onConfirm: () => void;  // called when the user clicks the confirm button
  onClose: () => void;    // called when the user clicks X or the backdrop
}) {
  const [typed, setTyped] = useState("");

  // The confirm button is only enabled when the typed text exactly matches the phrase
  const isMatch = typed === confirmPhrase;

  return (
    /* Backdrop — click to dismiss */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      {/* Modal card — stop propagation so clicking inside doesn't close */}
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button (X) in top-right corner */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Warning text */}
        <p className="text-sm text-gray-600 text-center leading-relaxed pr-6">
          {title} {description}
        </p>

        {/* Instruction — tells the user what to type */}
        <p className="text-sm font-semibold text-gray-900 text-center mt-5 mb-3">
          Please type &ldquo;{confirmPhrase}&rdquo;
        </p>

        {/* Verification input */}
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder=""
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900
                     text-center focus:outline-none focus:border-indigo-400 focus:ring-1
                     focus:ring-indigo-400 transition"
          autoFocus
        />

        {/* Error message from API */}
        {error && (
          <p className="text-xs text-red-500 text-center mt-2">{error}</p>
        )}

        {/* Confirm button — disabled until the typed phrase matches */}
        <button
          onClick={onConfirm}
          disabled={!isMatch || loading}
          className={`w-full mt-4 text-sm font-medium py-2.5 rounded-lg border transition
            ${isMatch
              ? "border-indigo-600 text-indigo-600 hover:bg-indigo-50"
              : "border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
        >
          {loading ? "Processing…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MenuButton — reusable dropdown menu item
// ---------------------------------------------------------------------------

/**
 * A single row in the three-dot dropdown menu.
 * Renders an icon + label with hover state. Destructive items are red.
 */
function MenuButton({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition
        ${destructive
          ? "text-red-500 hover:bg-red-50"      // red text + red hover for destructive actions
          : "text-gray-700 hover:bg-gray-50"     // default: dark text + gray hover
        }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SVG Icons — one for each menu action
// ---------------------------------------------------------------------------
// Kept inline in this file to avoid creating a separate icons file.
// Each icon is a 14x14 SVG (w-3.5 h-3.5) matching the menu item size.

/** Pencil icon for "Edit" */
function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

/** Upload icon for "File upload" */
function UploadIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

/** Plus icon for "Manual upload" */
function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

/** Refresh/sync icon for "Update sync" */
function SyncIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

/** Unlink icon for "Remove sync" */
function UnlinkIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

/** Dollar/currency icon for "Edit balance" */
function CurrencyIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/** Transfer/arrows icon for "Transfer data" */
function TransferIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

/** Archive/box icon for "Archive account" */
function ArchiveIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

/** Trash icon for "Clear trades" — accepts className for red color override */
function TrashIcon({ className = "text-gray-400" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

/** Square-X delete icon for "Delete account" — accepts className for red color override */
function DeleteIcon({ className = "text-gray-400" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
