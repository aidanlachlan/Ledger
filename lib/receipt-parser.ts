import { MAX_CENTS, toCents } from "./money";

export type ParsedItem = {
  rawName: string;
  lineTotalCents: number;
  quantity: number;
  unitPriceCents: number | null;
  savingsCents: number;
};
export type ParsedReceipt = {
  storeName: string | null;
  items: ParsedItem[];
  subtotalCents: number | null;
  savingsCents: number;
  taxCents: number | null;
  totalCents: number | null;
  mathCheck: "ok" | "mismatch" | "skipped";
};

export function checkMath(
  items: { lineTotalCents: number }[],
  total: number | null,
  tax: number | null,
  savings: number,
): ParsedReceipt["mathCheck"] {
  if (!items.length || total === null || tax === null) return "skipped";
  const sum = items.reduce((n, item) => n + item.lineTotalCents, 0);
  return Math.abs(sum + tax - total) <= 2 ||
    Math.abs(sum - savings + tax - total) <= 2
    ? "ok"
    : "mismatch";
}

const privateLine =
  /\*+\d{4}|\d{8,}|\b(?:AID|Chip|Debit|Credit|Visa|Paid|Change|Returns)\b|\bSold\s+Items\b|(?:\+?\d{1,2}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/i;
const token = /(?<![\d.,])(-?\$?\d+\.\d{2}|\(\$?\d+\.\d{2}\))(?![\d.%])/g;
const trailing =
  /(?:^|\s)(-?\$?\d+\.\d{2}|\(\$?\d+\.\d{2}\))(?:\s*(?:FT|F|T))?$/i;
const detail = /^(?:Qty|Reg|Savings)\b|@|\/lb/i;
const totalLabel =
  /^(Your Total Savings|Total Savings|Subtotal|Net Sales|Tax|Total)\b\s*:?/i;

function magnitude(value: string): number {
  return toCents(value.replace(/[-$()]/g, ""));
}
function item(name: string, value: string): ParsedItem {
  if (value.startsWith("-") || value.startsWith("("))
    throw new Error("Negative item amounts and returns are unsupported.");
  if (!name.trim() || name.length > 200)
    throw new Error("Item names must be 1 to 200 characters.");
  return {
    rawName: name.trim(),
    lineTotalCents: magnitude(value),
    quantity: 1,
    unitPriceCents: null,
    savingsCents: 0,
  };
}

export function parseReceipt(text: string): ParsedReceipt {
  if (text.length > 10_000)
    throw new Error("Paste no more than 10,000 characters.");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !privateLine.test(line));
  const result: ParsedReceipt = {
    storeName: null,
    items: [],
    subtotalCents: null,
    savingsCents: 0,
    taxCents: null,
    totalCents: null,
    mathCheck: "skipped",
  };
  let explicitSubtotal: number | null = null,
    net: number | null = null,
    explicitSavings: number | null = null;
  const layout: {
    kind: "text" | "price" | "total" | "detail";
    text: string;
    value?: string;
  }[] = [];
  let seenItem = false;
  for (const line of lines) {
    const label = line.match(totalLabel);
    if (label) {
      layout.push({ kind: "total", text: line });
      const matches = [...line.slice(label[0].length).matchAll(token)];
      if (!matches.length) continue;
      const raw = matches.at(-1)![1];
      const amount = magnitude(raw);
      const key = label[1].toLowerCase();
      if (!key.includes("savings") && /^[-(]/.test(raw))
        throw new Error("Negative totals are unsupported.");
      if (key.includes("savings")) explicitSavings = amount;
      else if (key === "subtotal") explicitSubtotal = amount;
      else if (key === "net sales") net = amount;
      else if (key === "tax") result.taxCents = amount;
      else result.totalCents = amount;
      continue;
    }
    if (detail.test(line)) {
      layout.push({ kind: "detail", text: line });
      const previous = result.items.at(-1);
      if (!previous) continue;
      const qty = line.match(/^Qty\s+(\d+(?:\.\d+)?)\b/i);
      if (qty) {
        if (
          !/^\d+(?:\.\d{1,3})?$/.test(qty[1]) ||
          Number(qty[1]) <= 0 ||
          Number(qty[1]) > 10_000
        )
          throw new Error(
            "Enter a valid quantity with up to three decimal places.",
          );
        previous.quantity = Number(qty[1]);
        const price = [...line.matchAll(token)].at(-1);
        if (price && !/\bReg\b/i.test(line))
          previous.unitPriceCents = magnitude(price[1]);
      }
      if (/^Savings\b/i.test(line)) {
        const price = [...line.matchAll(token)].at(-1);
        if (price) previous.savingsCents += magnitude(price[1]);
        if (previous.savingsCents > MAX_CENTS)
          throw new Error("Savings exceed the amount limit.");
      }
      continue;
    }
    const price = line.match(trailing);
    if (price) {
      const name = line.slice(0, price.index).trim();
      if (name) {
        result.items.push(item(name, price[1]));
        seenItem = true;
      } else layout.push({ kind: "price", text: line, value: price[1] });
    } else {
      layout.push({ kind: "text", text: line });
      if (!seenItem && result.storeName === null) result.storeName = line;
    }
  }
  if (!result.items.length && layout[0]?.kind === "text") {
    let index = 1;
    const names: string[] = [],
      prices: string[] = [];
    while (layout[index]?.kind === "text") names.push(layout[index++].text);
    while (layout[index]?.kind === "price") prices.push(layout[index++].value!);
    if (
      names.length &&
      names.length === prices.length &&
      layout.slice(index).every((line) => line.kind === "total")
    ) {
      result.items = names.map((name, i) => item(name, prices[i]));
    }
  }
  if (result.items.length > 200)
    throw new Error("Receipts may contain at most 200 items.");
  if (result.storeName && result.storeName.length > 120)
    throw new Error("Store names must be at most 120 characters.");
  result.subtotalCents = explicitSubtotal ?? net;
  result.savingsCents =
    explicitSavings ??
    result.items.reduce((sum, entry) => sum + entry.savingsCents, 0);
  if (result.savingsCents > MAX_CENTS)
    throw new Error("Savings exceed the amount limit.");
  result.mathCheck = checkMath(
    result.items,
    result.totalCents,
    result.taxCents,
    result.savingsCents,
  );
  return result;
}
