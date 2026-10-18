# Verification record

> **Update, October 18, 2026.** The record below is from the first build. Since then, purchase editing and deletion, password sign-in, and weekly history with budget history were added (migrations `0002`–`0004`). Current state: typecheck, lint and production build pass; `npm test` passes 23 tests across 4 files; `npm run test:db` applies all four migrations and also covers manual-purchase items, edit and delete, and budget history. Logged-in browser flows on a hosted Supabase project are still unverified.

Implemented and checked on October 15, 2026. Runtime for final checks: Node 24.22.0. No real Supabase credentials were configured.

| Check                                             | Result                                               |
| ------------------------------------------------- | ---------------------------------------------------- |
| Parser-first gate, before any screens             | 12 tests passed, including exact receipt fixture |
| `npm run typecheck`                               | Passed                                               |
| `npm run lint`                                    | Passed, zero warnings                                |
| `npm test`                                        | 18 tests passed across 3 files                       |
| `npm run build`                                   | Passed; all app routes dynamic                       |
| `grep -rE 'service_role\|sb_secret' .next/static` | No output, expected no-match exit code 1             |
| `npm run test:db` equivalent runner               | Passed on isolated PostgreSQL 18.6                   |
| Production browser smoke                          | Passed in Chromium at 390 × 844                      |
| Production dependency audit                       | Zero reported vulnerabilities                        |

The parser fixture produced 14 items, item sum 7,531 cents, subtotal 7,876, savings 345, tax 206, total 7,737, and math status `ok`. Parser tests cover columns, ambiguous columns, missing totals/tax, tolerance/mismatch, savings precedence, private lines, quantities, and limits.

Database tests use the real migration with a minimal local stub of Supabase Auth. They verify per-user visibility, blocked cross-user item insertion/reparenting, unchanged records after unauthorized updates/deletes, no anonymous access, invalid direct RPC inputs, date/quantity/money limits, server-computed math, sequential and concurrent request idempotence, and rollback after a forced second-item insertion failure. Temporary PostgreSQL data is removed afterward.

Browser smoke verifies the sign-in page renders without horizontal overflow; keyboard Tab reaches the visible skip link; every rendered script carries the matching nonce; repeated requests receive different nonces; production script policy has neither unsafe-inline nor unsafe-eval; HTML is no-store; X-Frame-Options is DENY; protected routes navigate to sign-in; and no browser console/page errors occur. It tests the real production build without an authenticated session.

Not verified: hosted Supabase Auth/session exchange, actual email delivery, logged-in browser workflows, live Data API isolation, and Vercel deployment. These require the setup in [SETUP.md](SETUP.md). No claim of deployment or complete live acceptance is made.

Development-tooling note: full npm audit reports five high findings in the current Next.js ESLint/fast-glob/micromatch/braces chain. Production audit is clean. A forced downgrade was not applied. The test runner was upgraded to Vitest 5 on Node 24 to remove the older runner advisories.

No scope features were skipped in the implementation. One schema correction: quantity uses unconstrained numeric with a precision check instead of numeric(8,3), so direct SQL rejects excess fractional precision instead of silently rounding it. Deliberate clarifications: dark theme only; current per-user weekly budget; no saved stores table; unknown tax remains null; independently editable line totals; invalid/ambiguous column layouts require manual review; raw receipt text remains in browser memory only; settings report partial failure if one of their two writes fails.
