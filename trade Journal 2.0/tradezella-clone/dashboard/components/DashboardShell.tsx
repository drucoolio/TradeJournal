/**
 * components/DashboardShell.tsx — Shared layout wrapper for all dashboard pages.
 *
 * Provides the standard app shell: sidebar + scrollable content area.
 * Used by every route layout to avoid duplicating the same flex container
 * and sidebar import in each layout.tsx file.
 *
 * LAYOUT:
 *   ┌────────┬──────────────────────────────────────────┐
 *   │        │                                          │
 *   │ Main   │  Page content ({children})               │
 *   │Sidebar │                                          │
 *   │        │                                          │
 *   └────────┴──────────────────────────────────────────┘
 *
 * Usage in any layout.tsx:
 *   import DashboardShell from "@/components/DashboardShell";
 *   export default function Layout({ children }) {
 *     return <DashboardShell>{children}</DashboardShell>;
 *   }
 */

import Sidebar from "@/components/Sidebar";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#f4f5f7] overflow-hidden">
      <Sidebar />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
