"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePurchase } from "../../actions";

// Two-step delete: the first press asks for confirmation.
export default function DeletePurchase({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!confirming)
    return (
      <button type="button" onClick={() => setConfirming(true)}>
        Delete purchase
      </button>
    );
  return (
    <div className="notice stack" role="group" aria-label="Confirm delete">
      <p>Delete this purchase and its items? This cannot be undone.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            try {
              const result = await deletePurchase(id);
              if (result.id) {
                router.push("/");
                router.refresh();
              } else setError(result.error || "Please retry.");
            } catch {
              setError("The connection was interrupted. Please retry.");
            }
          })
        }
      >
        {pending ? "Deleting…" : "Yes, delete it"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Keep it
      </button>
    </div>
  );
}
