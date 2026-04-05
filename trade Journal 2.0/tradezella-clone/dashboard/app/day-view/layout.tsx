/**
 * app/day-view/layout.tsx — Day View layout wrapper.
 * Uses the shared DashboardShell so the sidebar persists across navigation.
 */
import DashboardShell from "@/components/DashboardShell";

export default function DayViewLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
