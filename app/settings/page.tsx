import Link from "next/link";
import { getContext } from "../../lib/data";
import { decimal } from "../../lib/money";
import { requireUser } from "../../lib/auth";
import PasswordForm from "./password-form";
import SettingsForm from "./settings-form";
export default async function Settings() {
  const [context, { user }] = await Promise.all([getContext(), requireUser()]);
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <h1>Make the week yours.</h1>
      <p className="muted">
        Your limits are personal. Changes apply immediately to this week, Monday
        through Sunday.
      </p>
      <SettingsForm
        budget={decimal(context.grocery_weekly_cents)}
        meals={String(context.meals_out_weekly)}
        mealsBudget={decimal(context.meals_out_weekly_cents)}
        timezone={context.timezone}
      />
      <section className="settings-section">
        <PasswordForm email={user.email ?? ""} />
      </section>
    </>
  );
}
