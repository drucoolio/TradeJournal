/**
 * components/SyncButton.tsx — "Resync" button in the dashboard header.
 *
 * Client Component: manages its own async state for the sync operation.
 *
 * STATES:
 *   idle    → shows "Resync" in indigo (clickable)
 *   syncing → shows spinner + "Syncing…" in muted indigo (disabled)
 *   done    → shows "✓ N trades synced" in green (auto-resets after 4s)
 *   error   → shows error message in red (auto-resets after 5s)
 *
 * WHAT IT DOES:
 *   POSTs to /api/sync, which runs a full MT5 → Supabase sync:
 *     VPS /history → normalizeDeals → Supabase upsert (trades + sessions)
 *
 *   After a successful sync, router.refresh() re-runs the overview page's
 *   Server Component data fetch WITHOUT a full page reload. This is the
 *   Next.js App Router way to refresh server-fetched data from a Client Component.
 *
 * NOTE: The "Resync" button is not the primary sync mechanism — ideally the
 * mac/sync.py script runs on a schedule. But this button lets the user trigger
 * an immediate sync without opening a terminal.
 */

"use client"; // Required: uses useState, useRouter, fetch

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The four states the button can be in */
type State = "idle" | "syncing" | "done" | "error";

/**
 * Resync button component.
 * Self-contained — manages its own state, no props needed.
 */
export default function SyncButton() {
  const router = useRouter();

  const [state, setState] = useState<State>("idle");
  const [label, setLabel] = useState("Resync"); // button text changes with state

  /**
   * Triggers the sync by POSTing to /api/sync.
   * On success: shows trade count and refreshes page data.
   * On failure: shows error and auto-resets after 5 seconds.
   */
  async function handleSync() {
    setState("syncing");
    setLabel("Syncing…");

    try {
      const res  = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        // Handle 429 (rate limit) with a friendlier message showing wait time
        if (res.status === 429 && data.waitSeconds) {
          const mins = Math.ceil(data.waitSeconds / 60);
          throw new Error(`Sync available in ${mins} min${mins === 1 ? "" : "s"}`);
        }
        // Other errors — show the API error message
        throw new Error(data.error ?? "Sync failed");
      }

      // Success: data.synced = number of trade rows upserted
      setState("done");
      setLabel(`✓ ${data.synced} trades synced`);

      // Refresh the Server Component data so the dashboard reflects the new trades
      // router.refresh() re-fetches only the server-side data, not the whole page
      router.refresh();

      // Auto-reset the button to idle after 4 seconds
      setTimeout(() => {
        setState("idle");
        setLabel("Resync");
      }, 4_000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState("error");
      setLabel(`✗ ${msg}`);

      // Auto-reset to idle after 5 seconds so the user can try again
      setTimeout(() => {
        setState("idle");
        setLabel("Resync");
      }, 5_000);
    }
  }

  // Base button styles shared across all states
  const baseClass =
    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition";

  // State-specific styles — background and text colour convey the current state
  const stateClass =
    state === "idle"    ? "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer" :
    state === "syncing" ? "bg-indigo-900/50 text-indigo-400 cursor-not-allowed" :  // muted while in progress
    state === "done"    ? "bg-green-900/50 text-green-400 cursor-default" :          // green on success
                          "bg-red-900/50 text-red-400 cursor-default";               // red on error

  return (
    <button
      onClick={handleSync}
      disabled={state === "syncing"} // prevent double-click during sync
      className={`${baseClass} ${stateClass}`}
    >
      {/* Spinner icon — only shown during syncing state */}
      {state === "syncing" && (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {label}
    </button>
  );
}
