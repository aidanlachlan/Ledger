export const MAX_CENTS = 1_000_000;

export function toCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter a valid amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS)
    throw new Error("Amounts must be at most $10,000.00.");
  return cents;
}

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function decimal(cents: number | null): string {
  return cents === null
    ? ""
    : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
