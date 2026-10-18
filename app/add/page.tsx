import Link from "next/link";
import {
  getContext,
  getRecentPurchases,
  getStoreNames,
} from "../../lib/data";
import { decimal } from "../../lib/money";
import ManualEntry from "./manual-entry";

export default async function Add() {
  const [context, [last], stores] = await Promise.all([
    getContext(),
    getRecentPurchases(1, true),
    getStoreNames(),
  ]);
  const repeat = last
    ? {
        total: decimal(last.total_cents),
        storeName: last.store_name,
        type: last.type,
        note: last.note || "",
      }
    : undefined;
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <h1>Add a purchase.</h1>
      <p className="muted">A few details, and your week is up to date.</p>
      <ManualEntry
        today={context.today}
        stores={stores}
        repeat={repeat}
      />
    </>
  );
}
