// Shown while a page loads: a skeleton shaped like the typical list page (heading, filter bar, table rows).
export default function Loading() {
  return (
    <div className="p-8 space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-72 rounded-md bg-slate-800 animate-pulse" />
      <div className="h-24 rounded-xl border border-slate-800 bg-slate-900 animate-pulse" />
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-4 border-b border-slate-800 p-4 last:border-b-0">
            <div className="h-4 w-24 rounded bg-slate-800 animate-pulse" />
            <div className="h-4 flex-1 rounded bg-slate-800 animate-pulse" />
            <div className="h-4 w-20 rounded bg-slate-800 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
