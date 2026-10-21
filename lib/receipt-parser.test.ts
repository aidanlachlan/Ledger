import { describe, expect, it } from "vitest";
import { checkMath, parseReceipt } from "./receipt-parser";
import { toCents } from "./money";

export const fixture =
  "CORNER MARKET\nMain Street 001\nSMBZN OG ACAI BLND $8.99 F\nLNDB OG ROC WHT JASMINE R $7.09 F\nMVW SPRING WATER $3.59 FT\nALEXFF OG WHOLE A2 MILK $6.99 F\nSIGGI STRAWB DRINK YOGURT $1.70 F\nReg $2.19\nSavings ($0.49)\nSIGGI MXD BRRY YGRT DRINK $1.70 F\nReg $2.19\nSavings ($0.49)\nCHOBANI CHRY BERRY YOGURT $4.98 F\nQty 2 $2.49 ea\nCHOBANI STRWBRY KIWI YGRT $4.98 F\nQty 2 $2.49 ea\nGURU OG LT ENRGY DRK $6.98 FT\nQty 2 $3.49 ea\nOG BANANA $2.53 F\nQty 2.84 lb @ $0.89/lb\nCLASSIC ROTI CHICKEN $8.99 FT\nORGRNC OG GRND BEEF 93/7 $9.89 F\nReg $11.49\nSavings ($1.60)\nOG SWEETANGO APPLE $2.90 F\nQty 0.91 lb @ $3.19/lb\nOG GALA APPLE $4.00 F\nQty 1.81 lb Reg $2.69/lb\nSavings ($0.87)\nSubtotal: $78.76\nTotal Savings: -$3.45\nNet Sales: $75.31\nTax: 10.55% $2.06\nTotal: $77.37\nSold Items: 17\nDebit *0000 $77.37\nChip Card AID:A0000000000000";
const column =
  "CORNER MARKET\nAPPLES\nBREAD\n$3.00\n$4.00\nSubtotal: $7.00\nTax: $0.00\nTotal: $7.00";
describe("receipt parser", () => {
  it("passes the exact receipt fixture", () => {
    const r = parseReceipt(fixture);
    expect(r.storeName).toBe("CORNER MARKET");
    expect(r.items).toHaveLength(14);
    expect(r.items[0]).toMatchObject({
      rawName: "SMBZN OG ACAI BLND",
      lineTotalCents: 899,
    });
    expect(r.items[6]).toMatchObject({ quantity: 2, unitPriceCents: 249 });
    expect(r.items[11].savingsCents).toBe(160);
    expect(r.items[9]).toMatchObject({ quantity: 2.84, unitPriceCents: 89 });
    expect(r.items[13]).toMatchObject({ quantity: 1.81, unitPriceCents: null });
    expect(r).toMatchObject({
      subtotalCents: 7876,
      savingsCents: 345,
      taxCents: 206,
      totalCents: 7737,
      mathCheck: "ok",
    });
    expect(r.items.reduce((n, x) => n + x.lineTotalCents!, 0)).toBe(7531);
    expect(JSON.stringify(r)).not.toMatch(/0000|AID/);
  });
  it("pairs the exact column layout", () => {
    expect(parseReceipt(column)).toMatchObject({
      storeName: "CORNER MARKET",
      items: [
        { rawName: "APPLES", lineTotalCents: 300 },
        { rawName: "BREAD", lineTotalCents: 400 },
      ],
      mathCheck: "ok",
    });
  });
  it("refuses shifted or incomplete column layouts", () => {
    expect(
      parseReceipt(column.replace("APPLES", "LOCATION\nAPPLES")).items,
    ).toEqual([]);
    expect(parseReceipt(column.replace("$3.00\n", "")).items).toEqual([]);
    expect(
      parseReceipt(column.replace("$3.00\n$4.00", "$3.00\nOTHER\n$4.00")).items,
    ).toEqual([]);
  });
  it("skips missing totals and missing tax; uses explicit zero tax", () => {
    expect(parseReceipt("SHOP\nFOOD $1.00").mathCheck).toBe("skipped");
    expect(parseReceipt("SHOP\nFOOD $1.00\nTotal $1.00").taxCents).toBeNull();
    expect(parseReceipt("SHOP\nFOOD $1.00\nTotal $1.00").mathCheck).toBe(
      "skipped",
    );
    expect(
      parseReceipt("SHOP\nFOOD $1.00\nTax $0.00\nTotal $1.00").mathCheck,
    ).toBe("ok");
  });
  it("detects mismatches and the 2-cent tolerance", () => {
    expect(
      parseReceipt("SHOP\nFOOD $1.00\nTax $0.00\nTotal $2.00").mathCheck,
    ).toBe("mismatch");
    expect(checkMath([{ lineTotalCents: 100 }], 102, 0, 0)).toBe("ok");
    expect(checkMath([{ lineTotalCents: 100 }], 103, 0, 0)).toBe("mismatch");
    expect(checkMath([{ lineTotalCents: 100 }], 90, 0, 10)).toBe("ok");
  });
  it("keeps explicit subtotal in both orders and last same label", () => {
    for (const t of [
      "Subtotal $8.00\nNet Sales $7.00",
      "Net Sales $7.00\nSubtotal $8.00",
    ])
      expect(parseReceipt(t).subtotalCents).toBe(800);
    expect(parseReceipt("Subtotal $8.00\nSubtotal $9.00").subtotalCents).toBe(
      900,
    );
    expect(parseReceipt("Net Sales $7.00").subtotalCents).toBe(700);
  });
  it("normalizes savings without double counting", () => {
    for (const amount of ["-$0.50", "($0.50)"])
      expect(
        parseReceipt(
          "SHOP\nFOOD $1.00\nSavings ($0.50)\nTotal Savings: " + amount,
        ).savingsCents,
      ).toBe(50);
    expect(parseReceipt("SHOP\nFOOD $1.00\nSavings ($0.50)").savingsCents).toBe(
      50,
    );
    expect(
      parseReceipt(
        "SHOP\nFOOD $1.00\nSavings ($0.50)\nYour Total Savings $0.00",
      ).savingsCents,
    ).toBe(0);
  });
  it("filters payment data before store and fallback and uses whole words", () => {
    const r = parseReceipt(
      "VISA *1234\n" + column + "\nAID:123456789\nCall 206-555-1234",
    );
    expect(r.storeName).toBe("CORNER MARKET");
    expect(r.items).toHaveLength(2);
    expect(JSON.stringify(r)).not.toMatch(/1234|AID|VISA/);
    expect(parseReceipt("SHOP\nCREDITON MILK $1.00").items).toHaveLength(1);
  });
  it("does not use items or footers as store names or attach orphan details", () => {
    expect(parseReceipt("FOOD $1.00\nFOOTER").storeName).toBeNull();
    expect(
      parseReceipt("Qty 2 $1.00 ea\nSHOP\nFOOD $1.00").items[0].quantity,
    ).toBe(1);
  });
  it("rejects oversized inputs, prices, names, counts, quantities and negative items", () => {
    for (const input of [
      "x".repeat(10001),
      "SHOP\nFOOD $10000.01",
      "SHOP\nFOOD -$1.00",
      "SHOP\nFOOD ($1.00)",
      "SHOP\n" + "X".repeat(201) + " $1.00",
      "SHOP\nFOOD $1.00\nQty 0 $1.00 ea",
      "SHOP\nFOOD $1.00\nQty 1.0001 $1.00 ea",
      "SHOP\n" + "FOOD $1.00\n".repeat(201),
    ])
      expect(() => parseReceipt(input)).toThrow();
  });
});
// Grocery layout that prints multi-buy and per-unit prices on the line below
// the item name, with a tax table and a separate balance due.
const grocer = [
  "NEIGHBORHOOD GROCER #12",
  "Total:                         USD$ 52.38",
  "DELI GROCERY",
  "NAT ORG BRWN EGGS              $6.59  F",
  "WHITE CHEDDA                   $4.99  F",
  "You saved:   $ 0.30",
  ...Array(4).fill("You saved:   $ 0.74"),
  ...Array(4).fill("YOGURT\n1 @  4 FOR $5.00      $1.25  F"),
  "FROZEN",
  "MANGOS                         $4.89  F",
  "FRUIT IMMUNITY BLEND           $7.69  F",
  "GROCERY",
  "BAG FEE PAPER",
  "2 @    $0.08 EA                $0.16",
  "MEAT",
  "BEEFALO                        $11.99 F",
  "ORGANIC PRODUCE",
  "AVOCADO LG ORGANIC",
  "2 @  2 FOR $4.00               $4.00  F",
  "You saved:  $ 3.98",
  "MISC BABY PEELE                $3.99  F",
  "SOFT DRINKS",
  "LOTUS ENERGY                   $2.79 T F",
  "You saved:  $ 0.40",
  "TOTAL                          $52.09",
  "TAX-CODE   TAXABLE-VAL   TAX-VALUE",
  "SALE TX10.55     $2.79     $0.29",
  "15 BALANCE DUE                 $52.38",
  "VISA                           $52.38",
  "CHANGE                         $0.00",
  "Your Savings Today",
  "Item Savings                   $7.64",
].join("\n");
// The same receipt as OCR output: one line price is unreadable, another is
// garbled but recoverable from its deal line, tax flags are misread, a label
// is garbled and the balance due line is missing.
const grocerScan = grocer
  .replace("GROCER #12", "GROCER #12\n&")
  .replace(
    "NAT ORG BRWN EGGS              $6.59  F",
    "“ks ORE  BRU EGGS   danas   F",
  )
  .replace("$1.25  F", "$1.25 2upk")
  .replace("$1.25  F", "$1525 EE")
  .replace("2 @    $0.08 EA", "20     $0.08 EA")
  .replace("15 BALANCE DUE                 $52.38\n", "")
  .replace("Item Savings", "Str Savings");
describe("next-line grocery receipts", () => {
  const items = [
    ["NAT ORG BRWN EGGS", 659],
    ["WHITE CHEDDA", 499],
    ["YOGURT", 125],
    ["YOGURT", 125],
    ["YOGURT", 125],
    ["YOGURT", 125],
    ["MANGOS", 489],
    ["FRUIT IMMUNITY BLEND", 769],
    ["BAG FEE PAPER", 16],
    ["BEEFALO", 1199],
    ["AVOCADO LG ORGANIC", 400],
    ["MISC BABY PEELE", 399],
    ["LOTUS ENERGY", 279],
  ];
  it("reads prices on the next line, deal lines, tax table and balance due", () => {
    const r = parseReceipt(grocer);
    expect(r.items.map((i) => [i.rawName, i.lineTotalCents])).toEqual(items);
    expect(r.items[2]).toMatchObject({ quantity: 1, savingsCents: 0 });
    expect(r.items[1].savingsCents).toBe(30);
    expect(r.items[8]).toMatchObject({ quantity: 2, unitPriceCents: 8 });
    expect(r.items[10]).toMatchObject({ quantity: 2, savingsCents: 398 });
    expect(r.items[12].savingsCents).toBe(40);
    expect(r).toMatchObject({
      storeName: "NEIGHBORHOOD GROCER #12",
      subtotalCents: 5209,
      savingsCents: 764,
      taxCents: 29,
      totalCents: 5238,
      mathCheck: "ok",
      missingPrice: null,
    });
  });
  it("survives OCR noise and suggests, never fills, one unreadable price", () => {
    const r = parseReceipt(grocerScan);
    expect(r.storeName).toBe("NEIGHBORHOOD GROCER #12");
    expect(r.items.map((i) => i.lineTotalCents)).toEqual([
      null,
      ...items.slice(1).map(([, cents]) => cents),
    ]);
    expect(r.items[0].rawName).toBe("ks ORE BRU EGGS danas");
    expect(r.items[8]).toMatchObject({ quantity: 2, unitPriceCents: 8 });
    expect(r).toMatchObject({
      subtotalCents: 5209,
      savingsCents: 764,
      taxCents: 29,
      totalCents: 5238,
      mathCheck: "skipped",
      missingPrice: { name: "ks ORE BRU EGGS danas", cents: 659 },
    });
  });
  it("leaves a price blank when it cannot be worked out", () => {
    const r = parseReceipt(
      "SHOP\nEGGS ?? F\nMILK ?? F\nTax $0.00\nTotal $5.00",
    );
    expect(r.items.map((i) => i.lineTotalCents)).toEqual([null, null]);
    expect(r).toMatchObject({ mathCheck: "skipped", missingPrice: null });
  });
  it("works out an unreadable line price from its deal", () => {
    const prices = (line: string) =>
      parseReceipt("SHOP\nITEM\n" + line).items.map((i) => i.lineTotalCents);
    expect(prices("1@ 4 FOR $5.00   S12O NRE")).toEqual([125]);
    expect(prices("2 @ 2 FOR $4.00   $4.0O F")).toEqual([400]);
    expect(prices("3 @ $0.08 EA   $O.24")).toEqual([24]);
    expect(prices("1 @ 3 FOR $5.00   ?")).toEqual([]);
    expect(prices("999 @ $9999.99 EA   ?")).toEqual([]);
    expect(prices("1 @ 4 FOR $5.00   $1.26 F")).toEqual([126]);
  });
  it("accepts misread flags but not a second amount", () => {
    expect(parseReceipt("SHOP\nMILK $1.25 0 F").items[0].lineTotalCents).toBe(
      125,
    );
    expect(parseReceipt("SHOP\nMILK 1.00 2.00").items[0].lineTotalCents).toBe(
      200,
    );
  });
  it("reads an amount in USD as a total even under a garbled label", () => {
    expect(
      parseReceipt("SHOP\nTota): USD$ 2.10\nFOOD $2.00\nTax $0.10"),
    ).toMatchObject({ items: [{ lineTotalCents: 200 }], totalCents: 210 });
  });
  it("stops reading items once the totals start", () => {
    expect(
      parseReceipt("SHOP\nFOOD $1.00\nTotal $1.00\nStr Savings $7.64").items,
    ).toHaveLength(1);
  });
  it("does not treat a deal price alone as the line price", () => {
    expect(parseReceipt("SHOP\nYOGURT\n4 FOR $5.00").items).toEqual([]);
    expect(parseReceipt("SHOP\nBAG\n2 @ $0.08 EA").items).toMatchObject([
      { lineTotalCents: 16, quantity: 2, unitPriceCents: 8 },
    ]);
    expect(parseReceipt("SHOP\nUSD$ 52.38\n$ 3.98").items).toEqual([]);
  });
  it("uses the larger total when one is the other plus tax", () => {
    expect(
      parseReceipt("SHOP\nFOOD $9.00\nTotal $9.00\nTax $1.00\nTotal $10.00"),
    ).toMatchObject({ subtotalCents: 900, totalCents: 1000, mathCheck: "ok" });
  });
});
// Restaurant layout with a count and unit price on the item line and long
// total labels. Payment lines are omitted.
const driveIn = [
  "Burger Stand - Downtown",
  "100 Main St",
  "Springfield, ST 00000",
  "Duplicate Receipt #1",
  "10/20/2026                       4:19:08 PM",
  "Order Id: AAA9PNYLAEG9",
  "Reg 2- #223 - To Go",
  "Employee: Jehsiah S",
  "2 Cheeseburger (@3.25)             $6.50",
  "Sub Total                            $6.50",
  "County Sales Tax                     $0.69",
  "Total Tax                            $0.69",
  "Order Total                          $7.19",
  "Visa                                 $7.19",
  "AUTHORIZED AMOUNT                    $7.19",
  "--> Reprint #1 <--",
  "--> Order Closed <--",
  "Thank You!",
].join("\n");
describe("restaurant receipts", () => {
  const expected = {
    storeName: "Burger Stand - Downtown",
    items: [
      {
        rawName: "Cheeseburger",
        quantity: 2,
        unitPriceCents: 325,
        lineTotalCents: 650,
      },
    ],
    subtotalCents: 650,
    taxCents: 69,
    totalCents: 719,
    mathCheck: "ok",
  };
  it("reads count-and-unit items and long total labels", () => {
    expect(parseReceipt(driveIn)).toMatchObject(expected);
  });
  it("survives a misread @ and OCR noise before labels", () => {
    const scan = driveIn
      .replace("(@3.25)", "(63.25)")
      .replace("County Sales", "7 i bn : County Sales")
      .replace("Order Total", "it gr Order Total");
    expect(parseReceipt(scan)).toMatchObject(expected);
  });
  it("reads tax labels from any region", () => {
    for (const label of [
      "Tax",
      "Sales Tax",
      "Total Tax",
      "State Tax",
      "WA State Tax 6.5%",
      "NY State Sales Tax 8.875%",
      "City Sales Tax",
      "Local Tax:",
      "noise ~ County Tax",
    ])
      expect(
        parseReceipt(`SHOP\nFOOD $1.00\n${label}   $0.10\nTotal $1.10`),
      ).toMatchObject({ items: [{ rawName: "FOOD" }], taxCents: 10 });
  });
  it("keeps a count-and-unit line as is when the math does not fit", () => {
    expect(
      parseReceipt("SHOP\n2 Fries (@3.25)   $6.00").items[0],
    ).toMatchObject({ rawName: "2 Fries (@3.25)", quantity: 1 });
  });
});
describe("money", () => {
  it("parses decimal strings exactly", () => {
    expect(toCents("12")).toBe(1200);
    expect(toCents("12.3")).toBe(1230);
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("0.01")).toBe(1);
  });
  it("rejects unsupported syntax and out-of-range values", () => {
    for (const v of [
      "",
      "-1",
      "1e3",
      "NaN",
      "1.234",
      "10000.01",
      "9999999999999999999999",
    ])
      expect(() => toCents(v)).toThrow();
  });
});
