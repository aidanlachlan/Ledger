import { money } from "./money";

export function todayIn(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekBounds(today: string): {
  start: string;
  end: string;
  day: number;
} {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const start = addDays(today, 1 - day);
  return { start, end: addDays(start, 7), day };
}

export function budgetStatus(
  spent: number,
  budget: number,
  day: number,
): { text: string; kind: "on-track" | "watch" | "over" } {
  if (spent > budget)
    return { text: `Over by ${money(spent - budget)}`, kind: "over" };
  // Under half the budget is never a warning, even early in the week.
  if (spent * 7 <= budget * day || spent * 2 < budget)
    return { text: "On track", kind: "on-track" };
  return { text: "Watch", kind: "watch" };
}

export function progressPercent(spent: number, budget: number): number {
  return budget === 0
    ? spent > 0
      ? 100
      : 0
    : Math.min(100, Math.max(0, (spent / budget) * 100));
}

/** A weekly amount over a month of `days` days. */
export function monthlyEquivalent(weeklyCents: number, days: number): number {
  return Math.round((weeklyCents * days) / 7);
}

/** Number of days in the calendar month of a YYYY-MM-DD date. */
export function daysInMonth(date: string): number {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Full month name of a YYYY-MM-DD date, e.g. "October". */
export function monthName(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
