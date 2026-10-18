import Link from "next/link";
import { getBudgetHistory, getContext, getPurchases } from "../../lib/data";
import { weekStarts, weeklyHistory } from "../../lib/history";
import { money } from "../../lib/money";
import { weekBounds } from "../../lib/week";
import WeeklyChart from "./weekly-chart";

const MAX_WEEKS = 12;

export default async function History() {
  const context = await getContext();
  const current = weekBounds(context.today).start;
  const windowStart = weekStarts(current, MAX_WEEKS)[0];
  const [purchases, changes] = await Promise.all([
    getPurchases(windowStart),
    getBudgetHistory(),
  ]);
  // Start at the week you began: sign-up (the first budget record) or an
  // earlier-dated purchase. Weeks before that don't count as "within budget",
  // but quiet weeks since then do.
  const earliest = purchases.at(-1)?.purchased_on;
  const began = [
    current,
    changes[0]?.effective_week ?? current,
    earliest ? weekBounds(earliest).start : current,
  ].sort()[0];
  const firstWeek = began > windowStart ? began : windowStart;
  const count = Math.max(
    1,
    Math.round(
      (Date.parse(current) - Date.parse(firstWeek)) / (7 * 86_400_000),
    ) + 1,
  );
  const weeks = weeklyHistory(purchases, changes, weekStarts(current, count), {
    budgetCents: context.grocery_weekly_cents,
    mealsLimit: context.meals_out_weekly,
  });
  const past = weeks.slice(0, -1);
  const within = past.filter((w) => w.spentCents <= w.budgetCents).length;
  const average = past.length
    ? Math.round(past.reduce((n, w) => n + w.spentCents, 0) / past.length)
    : null;
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <p className="eyebrow">Week by week</p>
      <h1>How your weeks add up.</h1>
      <p className="muted">
        Each week runs Monday to Sunday and is measured against the budget you
        had that week.
      </p>
      <div className="stat-row">
        <section className="card stat">
          <h2>Average per week</h2>
          <p className="amount stat-value">
            {average === null ? "—" : money(average)}
          </p>
          <p className="muted">
            {past.length
              ? `Over the last ${past.length} full ${past.length === 1 ? "week" : "weeks"}`
              : "Shows after your first full week"}
          </p>
        </section>
        <section className="card stat">
          <h2>Within budget</h2>
          <p className="amount stat-value">
            {past.length ? `${within} of ${past.length}` : "—"}
          </p>
          <p className="muted">Full weeks, not counting this one</p>
        </section>
      </div>
      <section className="card">
        <WeeklyChart
          title="Food spending per week"
          kind="money"
          valueLabel="Spent"
          limitLabel="Budget"
          weeks={weeks.map((w) => ({
            start: w.start,
            value: w.spentCents,
            limit: w.budgetCents,
          }))}
        />
        <p className="helper">
          Groceries and convenience. Meals out are below.
        </p>
      </section>
      <section className="card">
        <WeeklyChart
          title="Meals out per week"
          kind="count"
          valueLabel="Meals out"
          limitLabel="Limit"
          weeks={weeks.map((w) => ({
            start: w.start,
            value: w.meals,
            limit: w.mealsLimit,
          }))}
        />
      </section>
      {weeks.length < 4 && (
        <p className="muted">
          Your history fills in as the weeks go by. Up to the last {MAX_WEEKS}{" "}
          weeks are shown.
        </p>
      )}
    </>
  );
}
