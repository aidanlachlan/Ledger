import { expect, it } from "vitest";
import { limitsFor, weekStarts, weeklyHistory } from "./history";

const fallback = { budgetCents: 15000, mealsLimit: 1 };
const changes = [
  {
    effective_week: "2026-10-05",
    grocery_weekly_cents: 15000,
    meals_out_weekly: 1,
  },
  {
    effective_week: "2026-10-12",
    grocery_weekly_cents: 12000,
    meals_out_weekly: 2,
  },
];

it("lists Mondays oldest first, ending with the current week", () => {
  expect(weekStarts("2026-10-12", 3)).toEqual([
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
  ]);
});

it("uses the budget in force for each week", () => {
  expect(limitsFor("2026-10-05", changes, fallback).budgetCents).toBe(15000);
  expect(limitsFor("2026-10-12", changes, fallback).budgetCents).toBe(12000);
  expect(limitsFor("2026-10-19", changes, fallback).mealsLimit).toBe(2);
  // Before the first recorded change, the earliest one applies.
  expect(limitsFor("2026-09-21", changes, fallback).budgetCents).toBe(15000);
  expect(limitsFor("2026-09-21", [], fallback)).toEqual(fallback);
});

it("totals each Monday-Sunday week like Home does", () => {
  const purchases = [
    { purchased_on: "2026-10-05", type: "groceries", total_cents: 1000 },
    { purchased_on: "2026-10-11", type: "convenience", total_cents: 250 },
    { purchased_on: "2026-10-11", type: "eating_out", total_cents: 4000 },
    { purchased_on: "2026-10-12", type: "groceries", total_cents: 500 },
  ];
  expect(
    weeklyHistory(purchases, changes, ["2026-10-05", "2026-10-12"], fallback),
  ).toEqual([
    {
      start: "2026-10-05",
      spentCents: 1250,
      meals: 1,
      budgetCents: 15000,
      mealsLimit: 1,
    },
    {
      start: "2026-10-12",
      spentCents: 500,
      meals: 0,
      budgetCents: 12000,
      mealsLimit: 2,
    },
  ]);
});
