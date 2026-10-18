# Ledger

A personal weekly food-spending tracker. Built with Next.js App Router, strict TypeScript, Tailwind CSS, Supabase Auth/Postgres/RLS, Zod, and Vitest. No AI, image upload, tracking scripts, service key, ORM, or separate application server.

## Run locally

Use Node **24.x** (also in `.nvmrc`).

```sh
nvm use
npm ci
cp .env.example .env.local
# Fill in the two public Supabase values in .env.local.
npm run dev
```

Open http://localhost:3000. Without Supabase configuration, the sign-in page shows an unavailable message and protected pages redirect to sign-in. No mock purchases or fake authenticated session are used.

If port 3000 is occupied, use `npm run dev -- -p 3048` and set server-only `APP_ORIGIN=http://localhost:3048` in your untracked `.env.local`. Add that exact callback to Supabase's redirect allowlist. The application never derives authentication redirects from an untrusted request Host header.

## Supabase setup

1. Create a fresh Supabase project. Apply every file in `supabase/migrations/` in filename order (`0001` through `0004`) using the SQL editor or your usual migration workflow. The app needs all of them: edit, history and manual items break without the later files. Do **not** run files under `supabase/tests/` on that project; those files are exclusively for the isolated test runner.
2. Under Authentication, enable the Email provider and email-link sign-in/sign-up. Account creation is enabled by the sign-in action. For this PKCE flow, retain the magic-link template's `{{ .ConfirmationURL }}` link; Supabase verifies the link and redirects to the app's callback with a code. The callback exchanges that code for a cookie session. Do not replace this with an unrelated token-hash callback flow.
3. Configure SMTP/email delivery for real users. Confirm sender settings and Auth email rate limits. Open each link in the **same browser** that requested it so its PKCE verifier cookie is available.
4. Set Auth **Site URL** to the final production origin, e.g. `https://ledger.example.com`. Allowlist these exact redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-PRODUCTION-HOST/auth/callback`
   - Any explicitly chosen local port or preview callback you actually use.
5. Copy the project HTTPS URL and public anonymous key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` and Vercel. A public publishable key can also be supplied using the existing ANON_KEY variable name. Never use a secret/service key.
6. The new-user trigger creates the profile and default weekly budget. This is a fresh-project migration; existing users from before migration application need profile/budget rows backfilled before using the app.

## Vercel setup

1. Put this project in your Git repository, commit the lockfile, and connect it to Vercel. Select the Next.js preset and Node 24.x. The build command is `npm run build`; Vercel handles Next.js output.
2. Set the two public Supabase variables for Production. Set server-only `APP_ORIGIN=https://YOUR-PRODUCTION-HOST` to pin the callback origin explicitly. Without it, the app uses Vercel's production project URL (or deployment URL when no project URL exists). Never include a path in APP_ORIGIN.
3. Use matching Supabase Site URL and callback allowlist entries. Redeploy after environment changes, because public variables are included at build time.
4. Push to the connected production branch. After deployment, verify real email sign-in, settings, both purchase flows, retry behavior, and isolation using two separate browser profiles/accounts.

Preview deployments require an explicit APP_ORIGIN for that preview and its exact allowlisted callback. Do not use the production callback for a sign-in started on another origin; its verifier cookie belongs to that other origin.

## What is implemented

- Email links, code exchange, cookie refresh through `proxy.ts`, verified server authorization, and POST sign-out.
- Per-user weekly grocery/convenience budget, meals-out count limit, and saved IANA timezone.
- Manual purchase entry with store autocomplete and Repeat last (today's date; no automatic save).
- Deterministic receipt parsing with conservative column fallback and private-line filtering. Receipt text is parsed in browser memory and never sent to a parser service or persisted. Only reviewed values are saved.
- Receipt review with editable store/date/type/note, totals, item names/quantities/unit prices/savings/line totals, add/remove items, and live math checks. Quantity edits do not silently change a paid line total.
- Weekly Home totals, negative remaining amounts, Monday–Sunday local calendar boundaries, prorated status, meals-out comparison, and recent purchases.
- Five-table RLS model (budget history is read-only, written by a trigger). Item ownership derives from the parent purchase; store autocomplete uses owned purchase names. Atomic invoker RPC with strict database validation, server-computed math, and concurrent retry protection.
- Responsive single-column dark UI, accessible labels/focus/targets, keyboard operation, and a nonce-based production CSP with no script unsafe-inline or unsafe-eval. HTML is dynamic and no-store. Development alone adds unsafe-eval and local websocket connections for framework tooling. Inline styles are allowed as specified.

The current budget applies immediately to the current week. There are no monthly or historical budgets. Each eating-out purchase counts as one meal, independently of its cost. Settings save timezone and budget sequentially; a partial failure is reported and values remain available for retry.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
grep -rE 'service_role|sb_secret' .next/static
```

The grep command must print nothing; exit status **1** means no matches. It is not proof that every possible secret is absent.

Database verification requires local `initdb`, `pg_ctl`, and `psql`:

```sh
npm run test:db
```

The runner creates a new temporary cluster using a private Unix socket, stubs Supabase's auth schema/roles and `auth.uid()`, applies the real migration, exercises two-user RLS, direct RPC validation, forced rollback, and concurrent same-request retries, then removes the cluster. It never uses an existing database or a service key. These tests validate PostgreSQL behavior, not hosted Supabase Auth/email delivery.

Observed checks during implementation: all four required commands passed under Node 24; **all unit tests passed**; the exact fixture produced 14 items totaling 7,531 cents and math `ok`; isolated database tests including concurrent retries passed; production browser smoke checked mobile layout, keyboard focus, CSP nonces, no-store headers, and unauthenticated redirects. See `VERIFICATION.md` for scope and remaining live checks.

Production dependency audit reported zero vulnerabilities. The full audit also reports development-only advisories in the current Next.js ESLint/glob dependency chain; the latest published braces/micromatch versions checked did not offer a patched compatible resolution. No forced framework/lint downgrade was applied. Review updates before exposing development tooling beyond localhost.

## Remaining live acceptance checks

No Supabase project credentials or Vercel connection were supplied, so no hosted migration, email delivery, authenticated browser flow, or deployment was performed. After setup:

1. Request a link, open it in the same browser, set budget/timezone, and add a manual purchase.
2. Use Repeat last; confirm today's date and no automatic save.
3. Paste the exact fixture from `Ledger-instructions.md`; edit an item/total, save, and verify Home.
4. Interrupt a save, retain all edits, and retry. Confirm only one purchase was saved.
5. Sign out. Use a second account and verify separate settings, autocomplete, purchases, and items. Repeat ownership checks against the actual project's Data API.
6. Check keyboard focus, small-screen layout, and the browser console for CSP errors in the deployed app.

Out-of-scope features in the brief remain omitted, including AI/images, payments, bank imports, shopping lists, account deletion, and light theme. Saved purchases can be edited and deleted, and a History page charts past weeks against the budget of the time.
