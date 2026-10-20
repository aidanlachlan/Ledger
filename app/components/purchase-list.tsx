import Link from "next/link";
import type { Purchase } from "../../lib/data";
import { money } from "../../lib/money";
import { typeLabels } from "../../lib/validation";

export default function PurchaseList({ purchases }: { purchases: Purchase[] }) {
  return (
    <ul className="purchase-list">
      {purchases.map((p) => (
        <li key={p.id}>
          <Link
            className="purchase-name"
            href={`/purchases/${p.id}`}
            prefetch={false}
          >
            {p.store_name}
          </Link>
          <span className="purchase-amount amount">
            {money(p.total_cents)}
          </span>
          <span className="muted">
            {typeLabels[p.type]} ·{" "}
            <time dateTime={p.purchased_on}>{p.purchased_on}</time>
          </span>
        </li>
      ))}
    </ul>
  );
}
