"use client";
import { useState } from "react";
import type { ParsedReceipt } from "../../lib/receipt-parser";
import { decimal, money } from "../../lib/money";
import type { PurchaseDraft } from "../../lib/validation";
import PurchaseForm from "./purchase-form";

function draftFrom(receipt: ParsedReceipt, today: string): PurchaseDraft {
  return {
    requestId: crypto.randomUUID(),
    storeName: receipt.storeName || "",
    purchasedOn: today,
    type: "groceries",
    source: "paste",
    subtotal: decimal(receipt.subtotalCents),
    savings: decimal(receipt.savingsCents),
    tax: decimal(receipt.taxCents),
    total: decimal(receipt.totalCents),
    note: "",
    items: receipt.items.map((item) => ({
      name: item.rawName,
      quantity: String(item.quantity),
      unitPrice: decimal(item.unitPriceCents),
      lineTotal: decimal(item.lineTotalCents),
      savings: decimal(item.savingsCents),
    })),
  };
}

// Describes how reliable a parsed receipt is, so that an incomplete read is
// never presented as a clean one.
function readNotice(receipt: ParsedReceipt): { text: string; watch: boolean } {
  if (receipt.mathCheck === "ok")
    return {
      watch: false,
      text: "The items add up to the receipt total. Review every field before saving.",
    };
  if (receipt.missingPrice)
    return {
      watch: true,
      text: `The price of “${receipt.missingPrice.name}” could not be read, so it is blank. If every other amount is right, it is ${money(receipt.missingPrice.cents)}. Check it and the item name against your receipt.`,
    };
  if (receipt.totalCents === null)
    return {
      watch: true,
      text: "This receipt did not read cleanly: its total could not be found. Enter the total you paid, then check or remove the items below.",
    };
  if (receipt.mathCheck === "mismatch")
    return {
      watch: true,
      text: "This receipt did not read cleanly: the items do not add up to the total. Check each amount against your receipt, or save just the total.",
    };
  if (receipt.items.some((item) => item.lineTotalCents === null))
    return {
      watch: true,
      text: "Some prices could not be read and are left blank. Fill them in from your receipt, or remove those items.",
    };
  return {
    watch: true,
    text: "The items could not be checked against the total, so some of this receipt may not have read cleanly. Review every field before saving.",
  };
}

export default function ReceiptReview({
  receipt,
  today,
  stores,
}: {
  receipt: ParsedReceipt;
  today: string;
  stores: string[];
}) {
  const [draft] = useState(() => draftFrom(receipt, today));
  const notice = readNotice(receipt);
  return (
    <>
      <p className={`notice ${notice.watch ? "watch" : ""}`} role="status">
        {notice.text}
      </p>
      <PurchaseForm initial={draft} today={today} stores={stores} />
    </>
  );
}
