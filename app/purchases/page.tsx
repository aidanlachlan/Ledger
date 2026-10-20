import Link from "next/link";
import { PAGE_SIZE, searchPurchases } from "../../lib/data";
import PurchaseList from "../components/purchase-list";

export default async function Purchases({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 120);
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const { purchases, total } = await searchPurchases(q, page);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (n: number) =>
    `/purchases?${new URLSearchParams({ ...(q && { q }), page: String(n) })}`;
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <h1>All purchases</h1>
      <form className="search" role="search" action="/purchases">
        <label>
          Search by store
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={120}
            placeholder="e.g. Whole Foods"
          />
        </label>
        <button>Search</button>
      </form>
      <p className="muted" role="status">
        {total === 1 ? "1 purchase" : `${total} purchases`}
        {q && ` matching “${q}”`}
      </p>
      <section className="card">
        {purchases.length ? (
          <PurchaseList purchases={purchases} />
        ) : (
          <p className="muted">
            {q ? "No purchases match that store." : "No purchases here yet."}
          </p>
        )}
      </section>
      {pages > 1 && (
        <nav className="actions view-switch" aria-label="Pages">
          {page > 1 ? (
            <Link className="button" href={link(page - 1)} prefetch={false}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            Page {Math.min(page, pages)} of {pages}
          </span>
          {page < pages ? (
            <Link className="button" href={link(page + 1)} prefetch={false}>
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
