export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="skeleton-bar skeleton-title" />
      {[0, 1].map((card) => (
        <div key={card} className="card">
          <div className="skeleton-bar skeleton-heading" />
          <div className="skeleton-bar skeleton-hero" />
          <div className="skeleton-bar" />
        </div>
      ))}
    </div>
  );
}
