"use client";
import { useState } from "react";
import Link from "next/link";
import { parseReceipt, type ParsedReceipt } from "../../lib/receipt-parser";
import ReceiptReview from "../components/receipt-review";
import { readReceipt, type ReadProgress } from "./read-receipt";

export default function ScanEntry({
  today,
  stores,
}: {
  today: string;
  stores: string[];
}) {
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [error, setError] = useState("");
  const [cameraNote, setCameraNote] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  if (receipt)
    return <ReceiptReview receipt={receipt} today={today} stores={stores} />;
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void scan(file);
  }
  async function scan(file: File) {
    setError("");
    setProgress({ step: "loading", percent: 0 });
    try {
      const text = await readReceipt(file, setProgress);
      setReceipt(parseReceipt(text.slice(0, 10_000)));
    } catch (err) {
      setError(
        err instanceof Error && !/fetch|network|load/i.test(err.message)
          ? `This photo could not be read: ${err.message}`
          : "This photo could not be read. Check your connection and try again, or paste the receipt text instead.",
      );
    } finally {
      setProgress(null);
    }
  }
  return (
    <div className="stack">
      {progress ? (
        <p className="button primary file-pick busy" aria-hidden="true">
          Reading receipt…
        </p>
      ) : (
        <>
          {/* Opens the camera on phones; turned off on computers, with a note. */}
          <label
            className="button primary file-pick"
            onClick={(e) => {
              if (!matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                setCameraNote(true);
              }
            }}
          >
            Take a photo
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={pick}
            />
          </label>
          {cameraNote && (
            <p className="notice" role="status">
              Taking a photo is turned off on computers. Choose a photo
              instead, or open Ledger on your phone.
            </p>
          )}
          <label className="button file-pick">
            Choose a photo
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={pick}
            />
          </label>
        </>
      )}
      {progress && (
        <div className="notice" role="status">
          <p>
            {progress.step === "loading"
              ? "Getting the reader ready. The first scan downloads about 7 MB."
              : `Reading the receipt… ${progress.percent}%`}
          </p>
          <progress
            value={progress.step === "reading" ? progress.percent : undefined}
            max={100}
            aria-label="Reading progress"
          />
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="helper">
        Lay the receipt flat on a dark surface, fill the frame, and avoid
        shadows and creases.
      </p>
      <p className="helper">
        Not reading well?{" "}
        <Link href="/paste" prefetch={false}>
          Paste receipt text instead
        </Link>
        .
      </p>
    </div>
  );
}
