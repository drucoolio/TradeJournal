/**
 * components/SettingsSidebar.tsx — Left sidebar for the Settings pages.
 *
 * Client Component because it uses usePathname() to highlight the active link.
 *
 * LAYOUT (mirrors Tradezella's Settings page):
 *   USER section:
 *     - Profile (editable user details)
 *     - Security (password change — future)
 *     - Subscription (plan management — future)
 *   GENERAL section:
 *     - Accounts (linked MT5 accounts — links to existing /accounts page)
 *     - Other items are stubs for now (disabled)
 *
 * Only "Profile" and "Accounts" are functional. Other items render as
 * disabled placeholders so the UI matches Tradezella's design.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A single settings sidebar nav item. */
interface SettingsNavItem {
  label: string;
  href: string;
  available: boolean; // false = rendered as disabled placeholder
}

/** USER section — account and security settings. */
const USER_NAV: SettingsNavItem[] = [
  { label: "Profile",      href: "/settings/profile",      available: true },
  { label: "Security",     href: "/settings/security",     available: false },
  { label: "Subscription", href: "/settings/subscription", available: false },
];

/** GENERAL section — app-wide configuration. */
const GENERAL_NAV: SettingsNavItem[] = [
  { label: "Accounts",            href: "/settings/accounts",            available: true },
  { label: "Commissions & fees",  href: "/settings/commissions",         available: false },
  { label: "Trade settings",      href: "/settings/trade-settings",      available: false },
  { label: "Global settings",     href: "/settings/global-settings",     available: false },
  { label: "Tags management",     href: "/settings/tags",                available: false },
  { label: "Import history",      href: "/settings/import-history",      available: false },
  { label: "Log history",         href: "/settings/log-history",         available: false },
];

/**
 * Renders a section of the settings sidebar (e.g. "USER" or "GENERAL").
 * Active item gets a highlighted background; disabled items show as muted.
 */
function SettingsSection({
  title,
  icon,
  items,
  pathname,
}: {
  title: string;
  icon: React.ReactNode;
  items: SettingsNavItem[];
  pathname: string;
}) {
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-1.5 px-3 mb-2">
        {icon}
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {title}
        </span>
      </div>

      {/* Section links */}
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = pathname === item.href;

          if (!item.available) {
            return (
              <div
                key={item.href}
                className="px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              >
                {item.label}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 text-sm rounded-lg transition
                ${isActive
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SettingsSidebar — left nav for all /settings/* pages.
 * Renders two sections (USER, GENERAL) with active state highlighting.
 */
export default function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <div className="w-56 flex-shrink-0 py-4 space-y-6">
      {/* USER section */}
      <SettingsSection
        title="User"
        icon={
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
        items={USER_NAV}
        pathname={pathname}
      />

      {/* GENERAL section */}
      <SettingsSection
        title="General"
        icon={
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        items={GENERAL_NAV}
        pathname={pathname}
      />
    </div>
  );
}
