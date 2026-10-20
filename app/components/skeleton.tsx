// Page-shaped loading placeholders. Each route's loading.tsx lists the
// blocks that mirror its layout; styles live under .skeleton in globals.css.
export type Block =
  | "back"
  | "title"
  | "line"
  | "hero"
  | "switch"
  | "field"
  | "button"
  | "row"
  | "card"
  | "card-short";

export default function Skeleton({ blocks }: { blocks: Block[] }) {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {blocks.map((block, i) =>
        block === "row" ? (
          <div key={i} className="sk-row">
            <div className="skeleton-block sk-card-short" />
            <div className="skeleton-block sk-card-short" />
          </div>
        ) : (
          <div key={i} className={`skeleton-block sk-${block}`} />
        ),
      )}
    </div>
  );
}
