import { MAX_CENTS, toCents } from "./money";

export type ParsedItem = {
  rawName: string;
  // Null when the item's line was read but its price was not.
  lineTotalCents: number | null;
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
  // When exactly one price could not be read: what it would be if every
  // other amount is right. A hint to check, never filled in.
  missingPrice: { name: string; cents: number } | null;
};

export function checkMath(
  items: { lineTotalCents: number | null }[],
  total: number | null,
  tax: number | null,
  savings: number,
): ParsedReceipt["mathCheck"] {
  if (!items.length || total === null || tax === null) return "skipped";
  if (items.some((item) => item.lineTotalCents === null)) return "skipped";
  const sum = items.reduce((n, item) => n + item.lineTotalCents!, 0);
  return Math.abs(sum + tax - total) <= 2 ||
    Math.abs(sum - savings + tax - total) <= 2
    ? "ok"
    : "mismatch";
}

const privateLine =
  /\*+\d{4}|\d{8,}|\b(?:AID|Chip|Debit|Credit|Visa|Paid|Change|Returns)\b|\bSold\s+Items\b|(?:\+?\d{1,2}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/i;
const amount = String.raw`-?(?:USD)?\$?\s?\d+\.\d{2}|\((?:USD)?\$?\s?\d+\.\d{2}\)`;
const token = new RegExp(String.raw`(?<![\d.,])(${amount})(?![\d.%])`, "gi");
// Tax flags printed after a price, such as F, FT or "T F". Any short token is
// accepted because OCR often misreads them; "ea" and amounts are excluded.
const trailing = new RegExp(
  String.raw`(?:^|\s)(${amount})(?:\s*(?!EA\b)[^\s$.,/]{1,4}){0,2}$`,
  "i",
);
const flagOnly = /\s(?:FT|TF|T\s?F|F)$/i;
const detail =
  /^(?:Qty|Reg|Savings|You\s+saved)\b|@|\/lb|\d\.\d{2}\s*EA\b|\bFOR\s+\$/i;
const labels = String.raw`Your Total Savings|Total Savings|Item Savings|Sub\s*-?\s*Total|Net Sales|(?:[a-z.]+\s+){0,3}Tax|Order Total|Grand Total|Total|(?:\d+\s+)?(?:Balance|Amount) Due`;
const totalLabel = new RegExp(String.raw`^(${labels})\b\s*:?`, "i");
// A label immediately before a line's final amount, for labels preceded by a
// long prefix or OCR noise ("County Sales Tax   $0.69").
const endLabel = new RegExp(
  String.raw`(?:^|\s)(${labels})\s*:?\s*(?=(?:${amount})(?:\s*[^\s$.,/]{1,4}){0,2}$)`,
  "i",
);
function labelKind(label: string) {
  const key = label.toLowerCase().replace(/\s+/g, " ");
  if (key.includes("savings")) return "savings";
  if (/^sub ?-? ?total$/.test(key)) return "subtotal";
  if (key === "net sales") return "net";
  if (key.endsWith("tax")) return "tax";
  if (key.endsWith("due")) return "due";
  return "total";
}
// An item line with its own count and unit price: "2 Cheeseburger (@3.25)".
const ownNameAt = /^\d{1,3}\s+[a-z]{2}.*@/i;
const taxHeader = /\bTAX[- ]VALUE\b/i;
const dealOrEach = /\bFOR\s+\$|\bEA\b/i;

// The line price implied by a deal line: "2 @ 2 FOR $4.00" is $4.00 and
// "2 @ $0.08 EA" is $0.16. Used when the printed line price is unreadable.
function dealPrice(line: string): number | null {
  const deal = line.match(
    new RegExp(String.raw`^(\d{1,3})\s*@\s*(\d{1,3})\s+FOR\s+(${amount})`, "i"),
  );
  const each = line.match(
    new RegExp(String.raw`^(\d{1,3})\s*@\s*(${amount})\s*EA\b`, "i"),
  );
  const cents = deal
    ? (Number(deal[1]) * magnitude(deal[3])) / Number(deal[2])
    : each
      ? Number(each[1]) * magnitude(each[2])
      : null;
  return cents !== null &&
    Number.isSafeInteger(cents) &&
    cents > 0 &&
    cents <= MAX_CENTS
    ? cents
    : null;
}
function magnitude(value: string): number {
  return toCents(value.replace(/USD|[-$()\s]/gi, ""));
}
function item(name: string, value: string | null): ParsedItem {
  if (value && (value.startsWith("-") || value.startsWith("(")))
    throw new Error("Negative item amounts and returns are unsupported.");
  // Strip stray quote marks, which OCR produces from specks at the edges.
  const rawName = name
    .replace(/\s+/g, " ")
    .replace(/^[\s“”"'‘’`]+|[\s“”"'‘’`]+$/g, "");
  if (!rawName || rawName.length > 200)
    throw new Error("Item names must be 1 to 200 characters.");
  return {
    rawName,
    lineTotalCents: value === null ? null : magnitude(value),
    quantity: 1,
    unitPriceCents: null,
    savingsCents: 0,
  };
}

// Splits "2 Cheeseburger (@3.25)   $6.50" into a quantity of 2 at $3.25. OCR
// can misread the @ as a digit, so the unit price is also tried without its
// first character. The split applies only when count × unit price equals
// the line total.
function counted(entry: ParsedItem): ParsedItem {
  const match = entry.rawName.match(
    /^(\d{1,3})\s+(.*?[a-z].*?)\s*\(\s*@?\s*\$?(\d*\d\.\d{2})\s*\)$/i,
  );
  if (!match || entry.lineTotalCents === null) return entry;
  const count = Number(match[1]);
  for (const unit of [match[3], match[3].slice(1)]) {
    if (!/^\d{1,4}\.\d{2}$/.test(unit)) continue;
    const cents = toCents(unit);
    if (count > 0 && count * cents === entry.lineTotalCents)
      return {
        ...entry,
        rawName: match[2],
        quantity: count,
        unitPriceCents: cents,
      };
  }
  return entry;
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
    missingPrice: null,
  };
  let explicitSubtotal: number | null = null,
    net: number | null = null,
    explicitSavings: number | null = null,
    looseSavings = 0,
    balanceDue: number | null = null,
    taxNext = false;
  const totals: number[] = [];
  const layout: {
    kind: "text" | "price" | "total" | "detail";
    text: string;
    value?: string;
  }[] = [];
  let seenItem = false;
  // Set once the totals section begins; later prices are not items.
  let closed = false;
  // A name printed on its own line, whose price may follow on the next.
  let pendingName: string | null = null;
  // Whether the previous line was an item or one of its details.
  let afterItem = false;
  for (const line of lines) {
    const name: string | null = pendingName;
    const follows: boolean = afterItem;
    pendingName = null;
    afterItem = false;
    const prices = [...line.matchAll(token)];
    if (taxNext && prices.length) {
      taxNext = false;
      layout.push({ kind: "total", text: line });
      result.taxCents = magnitude(prices.at(-1)![1]);
      continue;
    }
    if (taxHeader.test(line) && !prices.length) {
      taxNext = true;
      if (seenItem) closed = true;
      layout.push({ kind: "total", text: line });
      continue;
    }
    // Amounts with a currency code ("Total: USD$ 52.38") are totals, even
    // when OCR garbles the label.
    const coded = prices.findLast((price) => /USD/i.test(price[1]));
    if (coded && !totalLabel.test(line)) {
      layout.push({ kind: "total", text: line });
      totals.push(magnitude(coded[1]));
      continue;
    }
    const label = line.match(totalLabel) ?? line.match(endLabel);
    if (label) {
      layout.push({ kind: "total", text: line });
      const matches = [
        ...line.slice(label.index! + label[0].length).matchAll(token),
      ];
      if (!matches.length) continue;
      const raw = matches.at(-1)![1];
      const value = magnitude(raw);
      const key = labelKind(label[1]);
      if (seenItem && key !== "savings") closed = true;
      if (key !== "savings" && /^[-(]/.test(raw))
        throw new Error("Negative totals are unsupported.");
      if (key === "savings") explicitSavings = value;
      else if (key === "subtotal") explicitSubtotal = value;
      else if (key === "net") net = value;
      else if (key === "tax") result.taxCents = value;
      else if (key === "due") balanceDue = value;
      else totals.push(value);
      continue;
    }
    if (detail.test(line) && !ownNameAt.test(line)) {
      layout.push({ kind: "detail", text: line });
      const own = line.match(trailing);
      // A name followed by "1 @ 4 FOR $5.00   $1.25 F". A deal or unit price
      // on its own ("4 FOR $5.00") is not the line price.
      const read =
        own && (prices.length > 1 || !dealOrEach.test(line)) ? own[1] : null;
      const implied = read === null ? dealPrice(line) : null;
      if (
        name !== null &&
        !closed &&
        (read !== null || implied !== null) &&
        !/^(?:Qty|Reg|Savings|You)\b/i.test(line)
      ) {
        const entry = item(name, read);
        entry.lineTotalCents ??= implied;
        const count = line.match(/^(\d+(?:\.\d{1,3})?)\s*@/);
        if (count && Number(count[1]) > 0 && Number(count[1]) <= 10_000)
          entry.quantity = Number(count[1]);
        const each = line.match(
          new RegExp(String.raw`(${amount})\s*EA\b`, "i"),
        );
        if (each) {
          entry.unitPriceCents = magnitude(each[1]);
          if (
            !count &&
            entry.unitPriceCents > 0 &&
            entry.lineTotalCents! % entry.unitPriceCents === 0
          )
            entry.quantity = entry.lineTotalCents! / entry.unitPriceCents;
        }
        result.items.push(entry);
        seenItem = true;
        afterItem = true;
        continue;
      }
      const previous = result.items.at(-1);
      if (/^You\s+saved\b/i.test(line)) {
        // Some receipts print several in a row; only the first belongs to
        // the preceding item. The rest count toward total savings.
        const price = prices.at(-1);
        if (!price) continue;
        if (previous && follows && previous.savingsCents === 0) {
          previous.savingsCents = magnitude(price[1]);
          afterItem = true;
        } else looseSavings += magnitude(price[1]);
        continue;
      }
      if (!previous) continue;
      afterItem = follows;
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
        const price = prices.at(-1);
        if (price && !/\bReg\b/i.test(line))
          previous.unitPriceCents = magnitude(price[1]);
      }
      if (/^Savings\b/i.test(line)) {
        const price = prices.at(-1);
        if (price) previous.savingsCents += magnitude(price[1]);
        if (previous.savingsCents > MAX_CENTS)
          throw new Error("Savings exceed the amount limit.");
      }
      continue;
    }
    const price = line.match(trailing);
    if (price) {
      const itemName = line.slice(0, price.index).trim();
      if (itemName && !closed) {
        result.items.push(counted(item(itemName, price[1])));
        seenItem = true;
        afterItem = true;
      } else layout.push({ kind: "price", text: line, value: price[1] });
    } else if (
      !closed &&
      result.storeName !== null &&
      flagOnly.test(line) &&
      /[a-z]{3}/i.test(line)
    ) {
      // An item line whose price is unreadable, such as "EGGS ?.?? F".
      result.items.push(item(line.replace(flagOnly, ""), null));
      afterItem = true;
    } else {
      layout.push({ kind: "text", text: line });
      pendingName = line;
      if (!seenItem && result.storeName === null && /[a-z]{3}/i.test(line))
        result.storeName = line;
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
  // Some receipts print a total both before and after tax ("TOTAL $52.09",
  // then "BALANCE DUE $52.38"). The amount paid is the larger one.
  if (balanceDue !== null) totals.push(balanceDue);
  if (totals.length) {
    const paid = Math.max(...totals);
    const preTax = totals.find(
      (value) =>
        result.taxCents !== null &&
        result.taxCents > 0 &&
        Math.abs(value + result.taxCents - paid) <= 2,
    );
    result.totalCents =
      balanceDue ?? (preTax !== undefined ? paid : totals.at(-1)!);
    if (preTax !== undefined) explicitSubtotal ??= preTax;
  }
  result.subtotalCents = explicitSubtotal ?? net;
  result.savingsCents =
    explicitSavings ??
    result.items.reduce((sum, entry) => sum + entry.savingsCents, 0) +
      looseSavings;
  if (result.savingsCents > MAX_CENTS)
    throw new Error("Savings exceed the amount limit.");
  const unread = result.items.filter((entry) => entry.lineTotalCents === null);
  if (
    unread.length === 1 &&
    result.totalCents !== null &&
    result.taxCents !== null
  ) {
    const known = result.items.reduce(
      (sum, entry) => sum + (entry.lineTotalCents ?? 0),
      0,
    );
    const missing = result.totalCents - result.taxCents - known;
    if (missing > 0)
      result.missingPrice = { name: unread[0].rawName, cents: missing };
  }
  result.mathCheck = checkMath(
    result.items,
    result.totalCents,
    result.taxCents,
    result.savingsCents,
  );
  return result;
}
