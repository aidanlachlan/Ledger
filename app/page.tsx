import Link from "next/link";
import { getContext, getPurchases, getRecentPurchases } from "../lib/data";
import {
  budgetStatus,
  daysInMonth,
  monthlyEquivalent,
  progressPercent,
  weekBounds,
} from "../lib/week";
import { money } from "../lib/money";
import { signOut } from "./actions";
import PurchaseList from "./components/purchase-list";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getContext();
  const { start, end, day } = weekBounds(context.today);
  const monthStart = `${context.today.slice(0, 8)}01`;
  const [week, month, recent, params] = await Promise.all([
    getPurchases(start, end),
    getPurchases(monthStart),
    getRecentPurchases(5),
    searchParams,
  ]);
  const spent = week
    .filter((p) => p.type !== "eating_out")
    .reduce((n, p) => n + p.total_cents, 0);
  const mealsOut = week.filter((p) => p.type === "eating_out");
  const meals = mealsOut.length;
  const mealsSpent = mealsOut.reduce((n, p) => n + p.total_cents, 0);
  const budget = context.grocery_weekly_cents;
  const monthSpent = month
    .filter((p) => p.type !== "eating_out")
    .reduce((n, p) => n + p.total_cents, 0);
  const status = budgetStatus(spent, budget, day);
  return (
    <>
      <h1>This week</h1>
      <p className="muted">
        Week of <time dateTime={start}>{start}</time>
      </p>
      {params.error && (
        <p className="notice error" role="alert">
          Sign-out could not be completed. Please retry.
        </p>
      )}
      <section className="card" aria-labelledby="food-left">
        <h2 id="food-left">Food left this week</h2>
        <p className="hero amount">{money(budget - spent)}</p>
        <p className="amount muted">
          {money(spent)} of {money(budget)} spent
        </p>
        <progress
          value={progressPercent(spent, budget)}
          max={100}
          aria-label={`${money(spent)} of ${money(budget)} spent`}
        />
        <p className={`status amount ${status.kind}`}>{status.text}</p>
      </section>
      <section className="card">
        <h2>Meals out this week</h2>
        <p className="amount">
          {meals} of {context.meals_out_weekly}
        </p>
        <p className="amount muted">
          {money(mealsSpent)}
          {context.meals_out_weekly_cents === null
            ? " spent"
            : ` of ${money(context.meals_out_weekly_cents)} spent`}
        </p>
        <p className="muted">Each eating-out purchase counts as one meal.</p>
      </section>
      <section className="card" aria-labelledby="food-month">
        <h2 id="food-month">Food this month</h2>
        <p className="amount">
          {money(monthSpent)} of{" "}
          {money(monthlyEquivalent(budget, daysInMonth(context.today)))}
        </p>
        <p className="muted">
          Your weekly budget across the {daysInMonth(context.today)} days of{" "}
          {monthName(context.today)}.
        </p>
      </section>
      <section className="card" aria-labelledby="total-spent">
        <h2 id="total-spent">Total spent this week</h2>
        <p className="amount">{money(spent + mealsSpent)}</p>
        <p className="muted">Food budget and meals out together.</p>
      </section>
      <div className="actions">
        <Link className="button primary" href="/paste" prefetch={false}>
          Paste receipt
        </Link>
        <Link className="button" href="/add" prefetch={false}>
          Add manually
        </Link>
      </div>
      <section className="card">
        <h2>Recent purchases</h2>
        {recent.length ? (
          <>
            <PurchaseList purchases={recent} />
            <Link href="/purchases" prefetch={false}>
              All purchases →
            </Link>
          </>
        ) : (
          <p className="muted">
            Your first purchase starts the picture. Paste a receipt or add one
            manually.
          </p>
        )}
      </section>
      <div className="utility">
        <Link className="button" href="/history" prefetch={false}>
          History
        </Link>
        <Link className="button" href="/settings" prefetch={false}>
          Settings
        </Link>
        <form action={signOut}>
          <input type="hidden" name="intent" value="sign-out" />
          <button>Sign out</button>
        </form>
      </div>
    </>
  );
}

const monthName = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
