"use client";
import { useState, useTransition } from "react";
import { saveSettings } from "../actions";
import { money } from "../../lib/money";
import { moneyInput, type ActionResult } from "../../lib/validation";
import { monthlyEquivalent } from "../../lib/week";
export default function SettingsForm({
  budget,
  meals,
  mealsBudget,
  timezone,
}: {
  budget: string;
  meals: string;
  mealsBudget: string;
  timezone: string;
}) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const action = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        setState(await saveSettings({}, form));
      } catch {
        setState({
          error:
            "The connection was interrupted. Your values are still here. Please retry.",
        });
      }
    });
  };
  const [values, setValues] = useState({ budget, meals, mealsBudget, timezone });
  const weekly = moneyInput.safeParse(values.budget);
  return (
    <form onSubmit={action} className="stack">
      <label>
        Weekly food budget (USD)
        <input
          name="budget"
          inputMode="decimal"
          required
          maxLength={20}
          value={values.budget}
          onChange={(e) =>
            setValues((current) => ({ ...current, budget: e.target.value }))
          }
        />
        <span className="helper">
          Includes groceries and convenience purchases.
          {weekly.success &&
            ` About ${money(monthlyEquivalent(weekly.data))} a month.`}
        </span>
      </label>
      <label>
        Weekly meals-out limit
        <input
          name="meals"
          inputMode="numeric"
          required
          maxLength={3}
          value={values.meals}
          onChange={(e) =>
            setValues((current) => ({ ...current, meals: e.target.value }))
          }
        />
        <span className="helper">
          Each eating-out purchase counts as one meal.
        </span>
      </label>
      <label>
        Weekly meals-out budget (USD, optional)
        <input
          name="mealsBudget"
          inputMode="decimal"
          maxLength={20}
          value={values.mealsBudget}
          onChange={(e) =>
            setValues((current) => ({
              ...current,
              mealsBudget: e.target.value,
            }))
          }
        />
        <span className="helper">
          Leave blank for no limit. Kept separate from the food budget.
        </span>
      </label>
      <label>
        Timezone
        <input
          name="timezone"
          list="timezones"
          required
          maxLength={100}
          value={values.timezone}
          onChange={(e) =>
            setValues((current) => ({ ...current, timezone: e.target.value }))
          }
        />
        <span className="helper">
          Use an IANA timezone such as America/Los_Angeles.
        </span>
      </label>
      <datalist id="timezones">
        {[
          "America/Los_Angeles",
          "America/Denver",
          "America/Chicago",
          "America/New_York",
          "Pacific/Honolulu",
          "Europe/London",
          "Europe/Paris",
          "Asia/Tokyo",
          "Australia/Sydney",
        ].map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="notice success">
          {state.success}
        </p>
      )}
      <button className="primary" disabled={pending}>
        {pending ? "Saving settings…" : "Save settings"}
      </button>
    </form>
  );
}
