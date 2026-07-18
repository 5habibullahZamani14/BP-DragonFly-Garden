import { Skeleton } from "@/components/ui/skeleton";

// Card skeleton for general card layouts
export const CardSkeleton = () => (
  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 space-y-4">
    <div className="space-y-2">
      <Skeleton className="h-6 w-3/4 rounded-lg" />
      <Skeleton className="h-4 w-1/2 rounded-lg" />
    </div>
    <div className="space-y-3">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
    <Skeleton className="h-48 w-full rounded-xl" />
  </div>
);

// Chart skeleton for chart containers
export const ChartSkeleton = () => (
  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 space-y-4">
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-32 rounded-lg" />
    </div>
    <div className="space-y-3">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
    <Skeleton className="h-64 w-full rounded-xl" />
    <div className="flex justify-between">
      <Skeleton className="h-8 w-24 rounded-lg" />
      <Skeleton className="h-8 w-32 rounded-lg" />
    </div>
  </div>
);

// Table skeleton for data tables
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="bg-white/80 backdrop-blur-md border border-white/50 shadow-xl rounded-3xl overflow-hidden">
    <div className="p-6 border-b border-foreground/5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-32 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-5 w-32 rounded" />
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-5 w-20 rounded" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-3">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-5 w-20 rounded" />
        </div>
      ))}
    </div>
  </div>
);

// Grid skeleton for card grids
export const GridSkeleton = ({ count = 2 }: { count?: number }) => (
  <div className="grid grid-cols-1 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <ChartSkeleton key={i} />
    ))}
  </div>
);

// KPI cards skeleton
export const KpiSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-4 w-16 rounded-lg" />
      </div>
    ))}
  </div>
);

// Page skeleton for full page loading
export const PageSkeleton = () => (
  <div className="space-y-6 p-6 animate-fade-in">
    <div className="space-y-2">
      <Skeleton className="h-10 w-64 rounded-lg" />
      <Skeleton className="h-5 w-96 rounded-lg" />
    </div>
    <KpiSkeleton />
    <GridSkeleton count={2} />
  </div>
);

// Menu item skeleton
export const MenuItemSkeleton = () => (
  <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-2xl p-4 space-y-3">
    <div className="flex gap-4">
      <Skeleton className="h-24 w-24 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-6 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded-lg" />
      </div>
    </div>
    <div className="flex justify-between items-center">
      <Skeleton className="h-6 w-20 rounded-lg" />
      <Skeleton className="h-10 w-24 rounded-lg" />
    </div>
  </div>
);

// Tab skeleton for tab content
export const TabSkeleton = () => (
  <div className="space-y-6">
    <div className="flex gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-24 rounded-lg" />
      ))}
    </div>
    <PageSkeleton />
  </div>
);
