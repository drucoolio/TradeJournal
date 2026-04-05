/**
 * components/LoadingSkeleton.tsx — Shared loading skeleton primitives.
 *
 * Used by route-level `loading.tsx` files so that navigation feels instant:
 * Next.js renders the skeleton the moment a <Link> is clicked, then swaps in
 * the real server component output as soon as data is ready. This eliminates
 * the "dead click" perception while Supabase auth + DB round trips finish.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded ${className}`} />;
}

/** Full-page skeleton that matches the DashboardShell layout. */
export function PageSkeleton({ title = "Loading" }: { title?: string }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Shimmer className="h-48" />
          <Shimmer className="h-48" />
        </div>
        <Shimmer className="h-64" />
      </div>
    </div>
  );
}
