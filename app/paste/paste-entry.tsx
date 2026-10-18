"use client";
import { useState } from "react";
import { parseReceipt } from "../../lib/receipt-parser";
import { decimal } from "../../lib/money";
import type { PurchaseDraft } from "../../lib/validation";
import PurchaseForm from "../components/purchase-form";

export default function PasteEntry({
  today,
  stores,
}: {
  today: string;
  stores: string[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  if (draft)
    return (
      <>
        <p className="notice">
          Review every field before saving. Unrecognized details may need to be
          entered by hand.
        </p>
        <PurchaseForm initial={draft} today={today} stores={stores} />
      </>
    );
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          const receipt = parseReceipt(text);
          setDraft({
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
          });
          setText("");
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "This receipt could not be parsed. Please check the text.",
          );
        }
      }}
    >
      <label>
        Receipt text
        <textarea
          rows={14}
          required
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"STORE NAME\nAPPLES $3.00\nTax $0.00\nTotal $3.00"}
        />
      </label>
      <p className="helper">
        Copy text from a photo using Live Text or Google Lens. Raw receipt text
        is not saved. Up to 10,000 characters.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="primary">Review receipt</button>
    </form>
  );
}
