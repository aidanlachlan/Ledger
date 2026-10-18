import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchase } from "../../../lib/data";
import { money } from "../../../lib/money";
import { typeLabels } from "../../../lib/validation";
import DeletePurchase from "./delete-purchase";

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const purchase = await getPurchase((await params).id);
  if (!purchase) notFound();
  const items = purchase.purchase_items;
  const isReceipt = purchase.source === "paste";
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <p className="eyebrow">
        {typeLabels[purchase.type]} ·{" "}
        <time dateTime={purchase.purchased_on}>{purchase.purchased_on}</time>
      </p>
      <h1 className="purchase-name">{purchase.store_name}</h1>
      <p className="hero amount">{money(purchase.total_cents)}</p>
      {purchase.note && <p className="muted">{purchase.note}</p>}
      <section className="card" aria-labelledby="items">
        <h2 id="items">Items</h2>
        {items.length ? (
          <ul className="purchase-list">
            {items.map((item) => (
              <li key={item.position} className="item-row">
                <span className="purchase-name">{item.name}</span>
                <span className="amount">{money(item.line_total_cents)}</span>
                {(item.quantity !== 1 ||
                  item.unit_price_cents !== null ||
                  item.savings_cents > 0) && (
                  <span className="muted item-detail">
                    {item.quantity !== 1 && `Qty ${item.quantity}`}
                    {item.unit_price_cents !== null &&
                      ` @ ${money(item.unit_price_cents)}`}
                    {item.savings_cents > 0 &&
                      ` · saved ${money(item.savings_cents)}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No items listed for this purchase.</p>
        )}
      </section>
      {isReceipt && (
        <section className="card" aria-labelledby="receipt-totals">
          <h2 id="receipt-totals">Receipt totals</h2>
          <dl className="totals">
            {purchase.subtotal_cents !== null && (
              <>
                <dt>Subtotal</dt>
                <dd className="amount">{money(purchase.subtotal_cents)}</dd>
              </>
            )}
            <dt>Savings</dt>
            <dd className="amount">{money(purchase.savings_cents)}</dd>
            <dt>Tax</dt>
            <dd className="amount">
              {purchase.tax_cents === null
                ? "Unknown"
                : money(purchase.tax_cents)}
            </dd>
            <dt>Total</dt>
            <dd className="amount">{money(purchase.total_cents)}</dd>
          </dl>
          {purchase.math_check === "mismatch" && (
            <p className="watch">Item amounts did not match the total.</p>
          )}
        </section>
      )}
      <div className="actions">
        <Link
          className="button"
          href={`/purchases/${purchase.id}/edit`}
          prefetch={false}
        >
          Edit purchase
        </Link>
        <DeletePurchase id={purchase.id} />
      </div>
    </>
  );
}
