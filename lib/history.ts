import { addDays } from "./week";

export type BudgetChange = {
  effective_week: string;
  grocery_weekly_cents: number;
  meals_out_weekly: number;
};
export type WeekSummary = {
  start: string;
  spentCents: number;
  budgetCents: number;
  meals: number;
  mealsLimit: number;
};

/** Monday dates for the last `count` weeks, oldest first, ending at `currentStart`. */
export function weekStarts(currentStart: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    addDays(currentStart, -7 * (count - 1 - i)),
  );
}

/**
 * The limits in force for a week: the latest change on or before its Monday.
 * Weeks before the first recorded change use the earliest one.
 */
export function limitsFor(
  week: string,
  changes: BudgetChange[],
  fallback: { budgetCents: number; mealsLimit: number },
) {
  const sorted = [...changes].sort((a, b) =>
    a.effective_week.localeCompare(b.effective_week),
  );
  const match =
    sorted.filter((c) => c.effective_week <= week).at(-1) ?? sorted[0];
  return match
    ? {
        budgetCents: match.grocery_weekly_cents,
        mealsLimit: match.meals_out_weekly,
      }
    : fallback;
}

/** Totals per week, matching Home: eating out counts as meals, not budget spend. */
export function weeklyHistory(
  purchases: { purchased_on: string; type: string; total_cents: number }[],
  changes: BudgetChange[],
  starts: string[],
  fallback: { budgetCents: number; mealsLimit: number },
): WeekSummary[] {
  return starts.map((start) => {
    const end = addDays(start, 7);
    const week = purchases.filter(
      (p) => p.purchased_on >= start && p.purchased_on < end,
    );
    return {
      start,
      spentCents: week
        .filter((p) => p.type !== "eating_out")
        .reduce((n, p) => n + p.total_cents, 0),
      meals: week.filter((p) => p.type === "eating_out").length,
      ...limitsFor(start, changes, fallback),
    };
  });
}
