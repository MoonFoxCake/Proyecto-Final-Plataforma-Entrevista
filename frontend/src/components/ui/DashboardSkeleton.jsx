export function DashboardSkeleton({ label }) {
  return (
    <div role="status" aria-label={label} className="w-full max-w-4xl animate-pulse space-y-6">
      <div className="h-8 w-64 rounded-lg bg-[#E5E7EB]" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 rounded-2xl bg-[#E5E7EB]" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-[#E5E7EB]" />
    </div>
  );
}
