/**
 * Skeleton loading components — replace blank screens with animated placeholders.
 * Usage:
 *   <Skeleton className="h-8 w-48" />
 *   <StatCardSkeleton />
 *   <DocumentCardSkeleton />
 *   <MessageSkeleton />
 */

// ─── Base skeleton ─────────────────────────────────────────────────────────────
export function Skeleton({ className = "" }) {
  return (
    <div className={`bg-slate-800 rounded-lg animate-pulse ${className}`} />
  );
}

// ─── Stat card skeleton ────────────────────────────────────────────────────────
export function StatCardSkeleton() {
  return (
    <div className="bg-[#13131a] border border-slate-800 rounded-xl p-4">
      <Skeleton className="h-7 w-7 mb-3" />
      <Skeleton className="h-7 w-16 mb-1" />
      <Skeleton className="h-3 w-20 mb-1" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

// ─── Document card skeleton ────────────────────────────────────────────────────
export function DocumentCardSkeleton() {
  return (
    <div className="bg-[#13131a] border border-slate-800 rounded-xl p-4 flex items-start gap-4">
      <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

// ─── Chat message skeleton ────────────────────────────────────────────────────
export function MessageSkeleton({ isUser = false }) {
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0 mt-1" />
      <div className={`space-y-2 max-w-[60%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <Skeleton className="h-16 w-64 rounded-2xl" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// ─── Session list skeleton ────────────────────────────────────────────────────
export function SessionSkeleton() {
  return (
    <div className="p-2.5 space-y-1.5">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-2.5 w-1/2" />
    </div>
  );
}

// ─── Graph node skeleton (for entity list) ────────────────────────────────────
export function EntityRowSkeleton() {
  return (
    <tr>
      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
      <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
      <td className="px-4 py-3 text-right"><Skeleton className="h-3 w-8 ml-auto" /></td>
      <td className="px-4 py-3"><Skeleton className="h-3 w-10" /></td>
    </tr>
  );
}

// ─── Dashboard full skeleton ──────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12 animate-pulse">
      {/* Welcome */}
      <div className="mb-10">
        <Skeleton className="h-9 w-64 mb-3" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6 space-y-3">
          <Skeleton className="h-5 w-24 mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
        <div className="bg-[#13131a] border border-slate-800 rounded-xl p-6 space-y-3">
          <Skeleton className="h-5 w-36 mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-slate-800">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}