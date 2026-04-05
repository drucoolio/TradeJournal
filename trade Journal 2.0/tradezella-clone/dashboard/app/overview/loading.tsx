import DashboardShell from "@/components/DashboardShell";
import { PageSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <DashboardShell>
      <PageSkeleton title="Dashboard" />
    </DashboardShell>
  );
}
