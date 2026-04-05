import DashboardShell from "@/components/DashboardShell";
import SettingsSidebar from "@/components/SettingsSidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <div className="flex-1 min-w-0">
        <div className="px-8 pt-8 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>
        <div className="flex px-8 gap-8">
          <SettingsSidebar />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </DashboardShell>
  );
}
