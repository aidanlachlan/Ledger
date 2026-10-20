import { appOrigin } from "../../../lib/auth";
import SignInForm from "./sign-in-form";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  // Email links use the configured origin, never the request's Host.
  let origin: string | null = null;
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    try {
      origin = await appOrigin();
    } catch {
      /* Missing APP_ORIGIN in production: show the unavailable notice. */
    }
  }
  return (
    <>
      <p className="eyebrow">A little clarity for your week</p>
      <h1>Know where your food spending stands.</h1>
      <p className="muted">
        Keep track of groceries and meals out, one purchase at a time.
      </p>
      <section className="card">
        <h2>Sign in to Ledger</h2>
        <p className="muted">
          Use your password, or get a one-time link by email. Signed in with a
          link before? Set a password in Settings.
        </p>
        {reset === "done" && (
          <p className="notice success" role="status">
            Password updated. Sign in with your new password.
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            This link could not be used. Request a fresh link and open it in the
            same browser.
          </p>
        )}
        {origin ? (
          <SignInForm origin={origin} />
        ) : (
          <p className="notice">
            Sign-in is not available yet. Please try again after setup is
            complete.
          </p>
        )}
      </section>
    </>
  );
}
