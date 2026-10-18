import Link from "next/link";
import { notFound } from "next/navigation";
import PurchaseForm from "../../../components/purchase-form";
import { getContext, getPurchase, getStoreNames } from "../../../../lib/data";
import { decimal } from "../../../../lib/money";

export default async function EditPurchase({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [context, purchase, stores] = await Promise.all([
    getContext(),
    getPurchase(id),
    getStoreNames(),
  ]);
  if (!purchase) notFound();
  return (
    <>
      <nav>
        <Link href={`/purchases/${purchase.id}`} prefetch={false}>
          ← Back
        </Link>
      </nav>
      <h1>Edit purchase.</h1>
      <PurchaseForm
        purchaseId={purchase.id}
        today={context.today}
        stores={stores}
        initial={{
          requestId: purchase.request_id,
          storeName: purchase.store_name,
          purchasedOn: purchase.purchased_on,
          type: purchase.type,
          source: purchase.source,
          subtotal: decimal(purchase.subtotal_cents),
          savings: decimal(purchase.savings_cents),
          tax: decimal(purchase.tax_cents),
          total: decimal(purchase.total_cents),
          note: purchase.note || "",
          items: purchase.purchase_items.map((item) => ({
            name: item.name,
            quantity: String(item.quantity),
            unitPrice: decimal(item.unit_price_cents),
            lineTotal: decimal(item.line_total_cents),
            savings: decimal(item.savings_cents),
          })),
        }}
      />
    </>
  );
}
