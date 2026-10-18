"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePurchase, updatePurchase } from "../actions";
import { checkMath } from "../../lib/receipt-parser";
import { decimal, money } from "../../lib/money";
import {
  moneyInput,
  purchaseInput,
  type PurchaseDraft,
} from "../../lib/validation";

export default function PurchaseForm({
  initial,
  stores,
  today,
  repeat,
  purchaseId,
}: {
  initial: PurchaseDraft;
  stores: string[];
  today: string;
  repeat?: Partial<PurchaseDraft>;
  // Set when editing a saved purchase instead of creating a new one.
  purchaseId?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isReceipt = draft.source === "paste";
  const parsed = purchaseInput.safeParse(draft);
  const math = parsed.success
    ? checkMath(
        parsed.data.items.map((i) => ({ lineTotalCents: i.lineTotal })),
        parsed.data.total,
        parsed.data.tax,
        parsed.data.savings,
      )
    : null;
  const itemPrices = draft.items.map((item) =>
    moneyInput.safeParse(item.lineTotal),
  );
  const itemSum =
    draft.items.length && itemPrices.every((r) => r.success)
      ? itemPrices.reduce((n, r) => n + (r.data ?? 0), 0)
      : null;
  const set = (key: keyof Omit<PurchaseDraft, "items">, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function updateItem(
    index: number,
    key: keyof PurchaseDraft["items"][number],
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  }
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setError("");
        startTransition(async () => {
          try {
            const result = purchaseId
              ? await updatePurchase(purchaseId, draft)
              : await savePurchase(draft);
            if (result.id) {
              router.push(purchaseId ? `/purchases/${purchaseId}` : "/");
              router.refresh();
            } else
              setError(
                result.error ||
                  "The purchase could not be saved. Please retry.",
              );
          } catch {
            setError(
              "The connection was interrupted. Your edits are still here. Please retry.",
            );
          }
        });
      }}
    >
      <fieldset disabled={pending} className="stack">
        <legend>Purchase</legend>
        <label>
          {isReceipt ? "Receipt total (USD)" : "Amount (USD)"}
          <input
            className="amount-first amount"
            inputMode="decimal"
            autoFocus={!isReceipt}
            required
            maxLength={20}
            value={draft.total}
            onChange={(e) => set("total", e.target.value)}
            placeholder="0.00"
          />
        </label>
        {repeat && (
          <button
            type="button"
            onClick={() => {
              setDraft((current) => ({
                ...current,
                ...repeat,
                purchasedOn: today,
                requestId: current.requestId,
              }));
              setError("");
            }}
          >
            Repeat last
          </button>
        )}
        <label>
          Store
          <input
            list="past-stores"
            autoComplete="off"
            required
            maxLength={120}
            value={draft.storeName}
            onChange={(e) => set("storeName", e.target.value)}
            placeholder="Where did you shop?"
          />
        </label>
        <datalist id="past-stores">
          {stores.map((store) => (
            <option key={store} value={store} />
          ))}
        </datalist>
        <label>
          Type
          <select
            value={draft.type}
            onChange={(e) => set("type", e.target.value)}
          >
            <option value="groceries">Groceries</option>
            <option value="eating_out">Eating out</option>
            <option value="convenience">Convenience</option>
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            required
            max={today}
            value={draft.purchasedOn}
            onChange={(e) => set("purchasedOn", e.target.value)}
          />
        </label>
        <label>
          Note (optional)
          <textarea
            rows={3}
            maxLength={1000}
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </label>
      </fieldset>
      {isReceipt && (
        <fieldset disabled={pending} className="stack">
          <legend>Receipt totals</legend>
          <p className="helper">
            Use the amounts you paid. Blank tax means unknown; enter 0 for no
            tax.
          </p>
          <label>
            Subtotal (USD, optional)
            <input
              inputMode="decimal"
              maxLength={20}
              value={draft.subtotal}
              onChange={(e) => set("subtotal", e.target.value)}
            />
          </label>
          <label>
            Total savings (USD)
            <input
              inputMode="decimal"
              required
              maxLength={20}
              value={draft.savings}
              onChange={(e) => set("savings", e.target.value)}
            />
          </label>
          <label>
            Tax (USD, optional)
            <input
              inputMode="decimal"
              maxLength={20}
              value={draft.tax}
              onChange={(e) => set("tax", e.target.value)}
            />
          </label>
        </fieldset>
      )}
      <section className="stack" aria-labelledby="purchase-items">
        <h2 id="purchase-items">
          {isReceipt ? "Receipt items" : "Items (optional)"}
        </h2>
        <p className="helper">
          {isReceipt
            ? "Check each item against your receipt. Quantity and unit price changes do not change the line total automatically."
            : "List what you bought, or skip this and just save the amount."}
        </p>
        {isReceipt && draft.items.length === 0 && (
          <p className="notice">
            No items were recognized. Add items below, or save the purchase
            using its reviewed total.
          </p>
        )}
        {draft.items.map((item, index) => (
          <fieldset disabled={pending} key={index} className="stack">
            <legend>
              Item {index + 1} of {draft.items.length}
            </legend>
            <label>
              Name
              <input
                required
                maxLength={200}
                value={item.name}
                onChange={(e) => updateItem(index, "name", e.target.value)}
              />
            </label>
            <label>
              {isReceipt ? "Line total (USD)" : "Price (USD)"}
              <input
                inputMode="decimal"
                required
                maxLength={20}
                value={item.lineTotal}
                onChange={(e) => updateItem(index, "lineTotal", e.target.value)}
              />
            </label>
            <label>
              Quantity
              <input
                inputMode="decimal"
                required
                maxLength={12}
                value={item.quantity}
                onChange={(e) => updateItem(index, "quantity", e.target.value)}
              />
            </label>
            {isReceipt && (
              <>
                <label>
                  Unit price (USD, optional)
                  <input
                    inputMode="decimal"
                    maxLength={20}
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(index, "unitPrice", e.target.value)
                    }
                  />
                </label>
                <label>
                  Item savings (USD)
                  <input
                    inputMode="decimal"
                    required
                    maxLength={20}
                    value={item.savings}
                    onChange={(e) =>
                      updateItem(index, "savings", e.target.value)
                    }
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  items: current.items.filter((_, i) => i !== index),
                }))
              }
            >
              Remove item {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={pending || draft.items.length >= 200}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              items: [
                ...current.items,
                {
                  name: "",
                  quantity: "1",
                  unitPrice: "",
                  lineTotal: "",
                  savings: "0.00",
                },
              ],
            }))
          }
        >
          Add an item
        </button>
      </section>
      {isReceipt ? (
        <div
          className={`notice ${math === "mismatch" ? "watch" : ""}`}
          role="status"
        >
          {math === "ok"
            ? "Item amounts match the receipt total."
            : math === "mismatch"
              ? "Item amounts do not match the receipt total. Check the amounts, or save the total you reviewed."
              : "Math check needs items, total, and tax. You can still save a reviewed total."}
          {parsed.success && (
            <p className="amount">
              Item sum{" "}
              {money(parsed.data.items.reduce((n, i) => n + i.lineTotal, 0))}.
              Receipt total {money(parsed.data.total)}.
            </p>
          )}
        </div>
      ) : (
        itemSum !== null && (
          <div className="notice" role="status">
            <p className="amount">Items add up to {money(itemSum)}.</p>
            {moneyInput.safeParse(draft.total).data !== itemSum && (
              <button
                type="button"
                disabled={pending}
                onClick={() => set("total", decimal(itemSum))}
              >
                Use {money(itemSum)} as the amount
              </button>
            )}
          </div>
        )
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={pending}>
        {pending
          ? "Saving purchase…"
          : purchaseId
            ? "Save changes"
            : "Save purchase"}
      </button>
      <p className="helper">
        {isReceipt
          ? "The reviewed receipt total is what counts toward your week."
          : "Groceries and convenience count toward your food budget. Meals out are counted separately."}
      </p>
    </form>
  );
}
