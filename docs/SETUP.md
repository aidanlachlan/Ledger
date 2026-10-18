# Setup and deployment

## Run locally

Use Node **24.x** (also in `.nvmrc`).

```sh
nvm use
npm ci
cp .env.example .env.local
# Fill in the two public Supabase values in .env.local.
npm run dev
```

Open http://localhost:3000. Without Supabase configuration, the sign-in page shows an unavailable message and protected pages redirect to sign-in. There is no mock data or fake session.

If port 3000 is taken, run `npm run dev -- -p 3048` and set `APP_ORIGIN=http://localhost:3048` in `.env.local` (server-only). Add that exact callback URL to Supabase's redirect allowlist. Auth redirects are never built from the request's Host header.

## Supabase

1. **Create a project and apply the migrations.** Apply every file in `supabase/migrations/` in filename order (`0001` through `0004`), using the SQL editor or your usual migration workflow. The app needs all of them. Never run the files in `supabase/tests/` against a real project; they are only for the isolated local test runner.
2. **Enable email auth.** Under Authentication, enable the Email provider with both password sign-in and email links. Keep **Confirm email** on, so new password accounts confirm their address first. The app requires passwords of at least 8 characters; set Supabase's minimum to match or higher.
3. **Keep the default email templates' `{{ .ConfirmationURL }}` links.** Email links use the PKCE flow: Supabase verifies the link and redirects to `/auth/callback` with a one-time code, which the app exchanges for a cookie session. The code only works in the browser that requested the link, because that browser holds the matching verifier cookie. Don't switch to a token-hash link flow, which would let anyone holding the link sign in.
4. **Set up email delivery.** Configure SMTP for real users, and check the sender settings and Auth email rate limits.
5. **Set URLs.** Set the Auth **Site URL** to the production origin, for example `https://ledger.example.com`, and allowlist these exact redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-PRODUCTION-HOST/auth/callback`
   - any other local port or preview callback you actually use
6. **Copy the keys.** Put the project URL and the public anon (or publishable) key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, in `.env.local` and in Vercel. Never use a secret or service-role key; the app doesn't need one.

A database trigger creates each new user's profile and default budget ($150 a week, 1 meal out). The migrations assume a fresh project: users created before the migrations were applied need those rows backfilled.

## Vercel

1. Connect the Git repository to Vercel with the Next.js preset and Node 24.x. The build command is `npm run build`.
2. Set the two public Supabase variables for Production, plus server-only `APP_ORIGIN=https://YOUR-PRODUCTION-HOST` (an origin only, no path). Without `APP_ORIGIN`, the app falls back to Vercel's production project URL, then the deployment URL.
3. Make the Supabase Site URL and callback allowlist match. Redeploy after changing environment variables, because public variables are baked in at build time.

**Preview deployments** need their own `APP_ORIGIN` and an allowlisted callback for that preview's URL. A sign-in started on one origin can't finish on another, because its PKCE verifier cookie belongs to the first origin.

## Smoke test after deploying

1. Create an account with a password, confirm the email, and sign in. Then request an email link and open it in the same browser.
2. Set budget and timezone in Settings, and add a manual purchase. Check that **Repeat last** fills today's date and doesn't save on its own.
3. Paste the receipt fixture from [Ledger-instructions.md](Ledger-instructions.md), edit an item and the total, save, and check Home and History.
4. Edit and then delete a purchase.
5. Interrupt a save (for example, go offline), keep your edits, and retry. Only one purchase should be saved.
6. Sign out, sign in as a second user, and confirm you see none of the first user's settings, stores, purchases or items.
7. Check keyboard focus, the small-screen layout, and the browser console for Content Security Policy errors.

## Dependency audit

The production dependency audit reports no vulnerabilities. The full audit reports development-only advisories in the Next.js ESLint and glob dependency chain, with no compatible patched release at the time of writing. Don't expose development tooling beyond localhost.
