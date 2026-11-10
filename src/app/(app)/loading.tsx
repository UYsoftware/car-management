export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Ładowanie pulpitu" className="space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-line" />
      <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-card bg-line" />)}</div>
      <div className="h-48 animate-pulse rounded-card bg-line" />
    </div>
  );
}
