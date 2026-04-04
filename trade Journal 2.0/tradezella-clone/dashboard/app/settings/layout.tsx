/**
 * app/settings/layout.tsx — Shared layout for all /settings/* pages.
 *
 * Renders the main app sidebar on the left (same as /overview), and within
 * the content area renders the settings-specific sidebar + the active
 * settings page side by side.
 *
 * LAYOUT:
 *   ┌────────┬──────────────────────────────────────────┐
 *   │        │  "Settings" heading                      │
 *   │ Main   │  ┌────────────┬────────────────────────┐ │
 *   │Sidebar │  │ Settings   │  Page content           │ │
 *   │        │  │ Sidebar    │  (e.g. Profile form)    │ │
 *   │        │  │            │                          │ │
 *   │        │  └────────────┴────────────────────────┘ │
 *   └────────┴──────────────────────────────────────────┘
 *
 * This is a Server Component layout. The SettingsSidebar is a Client Component
 * (it uses usePathname for active state), but Next.js handles that boundary.
 */

import Sidebar from "@/components/Sidebar";
import SettingsSidebar from "@/components/SettingsSidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Main app sidebar — same navigation as /overview */}
      <Sidebar />

      {/* Settings content area */}
      <div className="flex-1 min-w-0">
        {/* Page heading */}
        <div className="px-8 pt-8 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>

        {/* Settings sidebar + page content side by side */}
        <div className="flex px-8 gap-8">
          <SettingsSidebar />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
