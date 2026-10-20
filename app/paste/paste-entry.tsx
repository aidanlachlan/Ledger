"use client";
import { useState } from "react";
import { parseReceipt, type ParsedReceipt } from "../../lib/receipt-parser";
import ReceiptReview from "../components/receipt-review";

export default function PasteEntry({
  today,
  stores,
}: {
  today: string;
  stores: string[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  if (receipt)
    return <ReceiptReview receipt={receipt} today={today} stores={stores} />;
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          setReceipt(parseReceipt(text));
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
