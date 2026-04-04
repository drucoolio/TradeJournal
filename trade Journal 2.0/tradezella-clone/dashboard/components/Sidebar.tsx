"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    label: "Dashboard",
    href: "/overview",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
      </svg>
    ),
    available: true,
  },
  {
    label: "Trade View",
    href: "/trades",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 3v18h18M7 16l4-4 4 4 4-8" />
      </svg>
    ),
    available: false,
  },
  {
    label: "Day View",
    href: "/day-view",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    available: false,
  },
  {
    label: "Notebook",
    href: "/notebook",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    available: false,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    available: false,
  },
  {
    label: "Strategies",
    href: "/strategies",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    available: false,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[168px] flex-shrink-0 bg-[#1b2236] h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 4-8" />
          </svg>
        </div>
        <span className="text-white font-bold text-sm tracking-wide">TRADEZELLA</span>
      </div>

      {/* Add Trade button */}
      <div className="px-3 py-3 border-b border-white/5">
        <button className="w-full bg-[#2a3355] hover:bg-[#334080] text-white text-xs
                           font-medium py-2 rounded-lg transition flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Trade
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <div key={item.href}>
              {item.available ? (
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition
                    ${isActive
                      ? "bg-[#2e3d6e] text-white"
                      : "text-[#8892b0] hover:bg-[#242f4f] hover:text-white"
                    }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs
                                font-medium text-[#4a5580] cursor-not-allowed">
                  {item.icon}
                  {item.label}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom — accounts, signout, and profile */}
      <div className="px-2 py-3 border-t border-white/5 space-y-0.5">
        <Link href="/settings/accounts"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium
                     text-[#8892b0] hover:bg-[#242f4f] hover:text-white transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Switch account
        </Link>
        <form action="/api/auth/signout" method="POST">
          <button type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium
                       text-[#8892b0] hover:bg-[#242f4f] hover:text-white transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </form>

        {/* Profile link — navigates to the settings/profile page */}
        <Link
          href="/settings/profile"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition
            ${pathname === "/settings/profile"
              ? "bg-[#2e3d6e] text-white"
              : "text-[#8892b0] hover:bg-[#242f4f] hover:text-white"
            }`}
        >
          {/* Person icon */}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Profile
        </Link>
      </div>
    </aside>
  );
}
