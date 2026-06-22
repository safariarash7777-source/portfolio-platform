// Shown while the dashboard server component fetches data. Skeletons preserve
// layout so the page doesn't flash a blank screen. Honors reduced-motion via the
// global rule in globals.css (which disables animation).

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: "var(--surface-2)" }}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10" aria-busy="true" aria-label="در حال بارگذاری داشبورد">
      {/* header */}
      <div className="flex justify-between items-start gap-4 mb-8">
        <div className="space-y-2">
          <Bar className="h-3 w-24" />
          <Bar className="h-7 w-56" />
          <Bar className="h-3 w-40" />
        </div>
        <Bar className="h-9 w-28" />
      </div>

      {/* assessment row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <Bar className="h-56" />
        <Bar className="h-56 md:col-span-2" />
      </div>

      {/* live portfolio: KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-28" />
        ))}
      </div>

      {/* donut + chart */}
      <div className="grid gap-5 lg:grid-cols-3 mb-5">
        <Bar className="h-64 lg:col-span-1" />
        <Bar className="h-64 lg:col-span-2" />
      </div>

      {/* table */}
      <Bar className="h-72" />
    </div>
  );
}
