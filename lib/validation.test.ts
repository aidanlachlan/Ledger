import { expect, it } from "vitest";
import { passwordInput, purchaseInput, settingsInput } from "./validation";
const manual = {
  requestId: "6b43af7b-2a9a-4d0c-bf57-7ad27e0c8e49",
  storeName: " Shop ",
  purchasedOn: "2026-10-15",
  type: "groceries",
  source: "manual",
  subtotal: "",
  savings: "0.00",
  tax: "",
  total: "12.34",
  note: "",
  items: [],
};
it("validates money strings and rejects client ownership and forged manual detail", () => {
  expect(purchaseInput.parse(manual).total).toBe(1234);
  expect(
    purchaseInput.safeParse({ ...manual, user_id: "other-user" }).success,
  ).toBe(false);
  expect(purchaseInput.safeParse({ ...manual, tax: "1.00" }).success).toBe(
    false,
  );
  expect(
    purchaseInput.safeParse({ ...manual, purchasedOn: "2026-02-30" }).success,
  ).toBe(false);
});
it("accepts optional items on manual purchases", () => {
  const withItems = {
    ...manual,
    items: [
      {
        name: "Apples",
        quantity: "3",
        unitPrice: "",
        lineTotal: "4.50",
        savings: "0.00",
      },
    ],
  };
  expect(purchaseInput.parse(withItems).items[0].lineTotal).toBe(450);
});
it("validates settings boundaries and timezone", () => {
  expect(
    settingsInput.safeParse({
      budget: "150",
      meals: "1",
      timezone: "America/Los_Angeles",
    }).success,
  ).toBe(true);
  expect(
    settingsInput.safeParse({
      budget: "150",
      meals: "101",
      timezone: "Invalid/Zone",
    }).success,
  ).toBe(false);
});
it("requires passwords of 8 to 72 characters", () => {
  expect(passwordInput.safeParse("short").success).toBe(false);
  expect(passwordInput.safeParse("long enough").success).toBe(true);
  expect(passwordInput.safeParse("x".repeat(73)).success).toBe(false);
});
