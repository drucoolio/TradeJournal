import { Shimmer } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <div className="flex-1 p-6 space-y-4">
      <Shimmer className="h-8 w-48" />
      <Shimmer className="h-32" />
      <Shimmer className="h-32" />
    </div>
  );
}
