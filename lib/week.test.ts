import { expect, it } from "vitest";
import {
  budgetStatus,
  progressPercent,
  todayIn,
  validDate,
  weekBounds,
} from "./week";

it("uses saved local dates at Sunday/Monday UTC boundaries", () => {
  expect(todayIn("America/Los_Angeles", new Date("2026-10-19T01:00:00Z"))).toBe(
    "2026-10-18",
  );
  expect(todayIn("Asia/Tokyo", new Date("2026-10-18T16:00:00Z"))).toBe(
    "2026-10-19",
  );
  expect(weekBounds("2026-10-18")).toEqual({
    start: "2026-10-12",
    end: "2026-10-19",
    day: 7,
  });
  expect(weekBounds("2026-10-19")).toEqual({
    start: "2026-10-19",
    end: "2026-10-26",
    day: 1,
  });
});
it("handles DST weeks with calendar arithmetic", () => {
  expect(weekBounds("2026-03-08")).toEqual({
    start: "2026-03-02",
    end: "2026-03-09",
    day: 7,
  });
  expect(weekBounds("2026-11-01")).toEqual({
    start: "2026-10-26",
    end: "2026-11-02",
    day: 7,
  });
});
it("validates real calendar dates", () => {
  expect(validDate("2024-02-29")).toBe(true);
  for (const d of ["2026-02-29", "2026-13-01", "2026-01-32", "not a date"])
    expect(validDate(d)).toBe(false);
});
it("defines prorated, full-budget and zero-budget boundaries", () => {
  expect(budgetStatus(100, 700, 1).kind).toBe("on-track");
  expect(budgetStatus(101, 700, 1).kind).toBe("watch");
  expect(budgetStatus(700, 700, 6).kind).toBe("watch");
  expect(budgetStatus(700, 700, 7).kind).toBe("on-track");
  expect(budgetStatus(701, 700, 7).text).toBe("Over by $0.01");
  expect(budgetStatus(0, 0, 1).kind).toBe("on-track");
  expect(budgetStatus(1, 0, 1).kind).toBe("over");
  expect(progressPercent(0, 0)).toBe(0);
  expect(progressPercent(1, 0)).toBe(100);
  expect(progressPercent(800, 700)).toBe(100);
});
