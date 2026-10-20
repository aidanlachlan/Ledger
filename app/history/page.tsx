import Link from "next/link";
import { getBudgetHistory, getContext, getPurchases } from "../../lib/data";
import { dailyHistory, weekStarts, weeklyHistory } from "../../lib/history";
import { money } from "../../lib/money";
import { addDays, weekBounds } from "../../lib/week";
import WeeklyChart from "./weekly-chart";

const MAX_WEEKS = 12;
const DAYS = 14;

export default async function History({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const context = await getContext();
  const fallback = {
    budgetCents: context.grocery_weekly_cents,
    mealsLimit: context.meals_out_weekly,
  };
  if ((await searchParams).view === "days") {
    const days = Array.from({ length: DAYS }, (_, i) =>
      addDays(context.today, i - DAYS + 1),
    );
    const [purchases, changes] = await Promise.all([
      getPurchases(days[0]),
      getBudgetHistory(),
    ]);
    return (
      <>
        <HistoryHeader view="days" />
        <section className="card">
          <WeeklyChart
            title="Food spending per day"
            kind="money"
            unit="day"
            valueLabel="Spent"
            limitLabel="Daily share"
            weeks={dailyHistory(purchases, changes, days, fallback)}
          />
          <p className="helper">
            Groceries and convenience over the last {DAYS} days. The daily
            share is that week&rsquo;s budget divided by seven.
          </p>
        </section>
      </>
    );
  }
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
  const weeks = weeklyHistory(
    purchases,
    changes,
    weekStarts(current, count),
    fallback,
  );
  const past = weeks.slice(0, -1);
  const within = past.filter((w) => w.spentCents <= w.budgetCents).length;
  const average = past.length
    ? Math.round(past.reduce((n, w) => n + w.spentCents, 0) / past.length)
    : null;
  return (
    <>
      <HistoryHeader view="weeks" />
      <p className="muted">
        Each week runs Monday to Sunday and is measured against the budget you
        had that week.
      </p>
      <div className="stat-row">
        <section className="card stat">
          <h2>Within budget</h2>
          <p className="amount stat-value">
            {past.length ? `${within} of ${past.length}` : "—"}
          </p>
          <p className="muted">Full weeks, not counting this one</p>
        </section>
        <section className="card stat">
          <h2>Average per week</h2>
          <p className="amount stat-value">
            {average === null ? "—" : money(average)}
          </p>
          <p className="muted">
            {past.length
              ? past.length === 1
                ? "Over your last full week"
                : `Over the last ${past.length} full weeks`
              : "Shows after your first full week"}
          </p>
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

function HistoryHeader({ view }: { view: "weeks" | "days" }) {
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <h1>History</h1>
      <div className="actions view-switch" role="group" aria-label="View">
        {(["weeks", "days"] as const).map((option) => (
          <Link
            key={option}
            className={option === view ? "button primary" : "button"}
            href={option === "weeks" ? "/history" : "/history?view=days"}
            aria-current={option === view ? "page" : undefined}
            prefetch={false}
          >
            {option === "weeks" ? "Weeks" : "Days"}
          </Link>
        ))}
      </div>
    </>
  );
}
