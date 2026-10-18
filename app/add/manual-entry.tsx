"use client";
import { useState } from "react";
import PurchaseForm from "../components/purchase-form";
import type { PurchaseDraft } from "../../lib/validation";
export default function ManualEntry({
  today,
  stores,
  repeat,
}: {
  today: string;
  stores: string[];
  repeat?: Partial<PurchaseDraft>;
}) {
  const [initial] = useState<PurchaseDraft>(() => ({
    requestId: crypto.randomUUID(),
    storeName: "",
    purchasedOn: today,
    type: "groceries",
    source: "manual",
    subtotal: "",
    savings: "0.00",
    tax: "",
    total: "",
    note: "",
    items: [],
  }));
  return (
    <PurchaseForm
      initial={initial}
      today={today}
      stores={stores}
      repeat={repeat}
    />
  );
}
