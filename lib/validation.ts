import { z } from "zod";
import { toCents } from "./money";
import { validDate } from "./week";

export const moneyInput = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    try {
      return toCents(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter an amount from 0 to 10,000 with up to two decimal places.",
      });
      return z.NEVER;
    }
  });
const optionalMoney = z.union([
  z.literal("").transform(() => null),
  moneyInput,
]);
const quantity = z
  .string()
  .regex(
    /^\d+(?:\.\d{1,3})?$/,
    "Enter a quantity with up to three decimal places.",
  )
  .transform(Number)
  .pipe(z.number().gt(0).max(10000));
export const timezoneInput = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA timezone, such as America/Los_Angeles.");
// Supabase hashes with bcrypt, which only uses the first 72 bytes.
export const passwordInput = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");
export const settingsInput = z
  .object({
    budget: moneyInput,
    meals: z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(z.number().int().min(0).max(100)),
    mealsBudget: optionalMoney,
    timezone: timezoneInput,
  })
  .strict();
export const purchaseInput = z
  .object({
    requestId: z.uuid(),
    storeName: z.string().trim().min(1, "Enter a store.").max(120),
    purchasedOn: z.string().refine(validDate, "Enter a real calendar date."),
    type: z.enum(["groceries", "eating_out", "convenience"]),
    source: z.enum(["manual", "paste"]),
    subtotal: optionalMoney,
    savings: moneyInput,
    tax: optionalMoney,
    total: moneyInput,
    note: z.string().trim().max(1000),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1, "Enter an item name.").max(200),
            quantity,
            unitPrice: optionalMoney,
            lineTotal: moneyInput,
            savings: moneyInput,
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.source === "manual" &&
      (value.subtotal !== null || value.tax !== null || value.savings !== 0)
    )
      ctx.addIssue({
        code: "custom",
        message: "Manual purchases cannot contain receipt totals.",
      });
  });
export type PurchaseDraft = {
  requestId: string;
  storeName: string;
  purchasedOn: string;
  type: "groceries" | "eating_out" | "convenience";
  source: "manual" | "paste";
  subtotal: string;
  savings: string;
  tax: string;
  total: string;
  note: string;
  items: {
    name: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    savings: string;
  }[];
};
export const typeLabels = {
  groceries: "Groceries",
  eating_out: "Eating out",
  convenience: "Convenience",
} as const;
export type ActionResult = { error?: string; success?: string; id?: string };
