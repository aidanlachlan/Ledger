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
    expect(r.items.reduce((n, x) => n + x.lineTotalCents, 0)).toBe(7531);
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
