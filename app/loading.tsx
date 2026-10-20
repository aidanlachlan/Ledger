export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="skeleton-block skeleton-title" />
      <div className="skeleton-block skeleton-card" />
      <div className="skeleton-block skeleton-card short" />
    </div>
  );
}
