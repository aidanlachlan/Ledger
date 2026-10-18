# Ledger: instructions for coding agents

Ledger is a multi-user web app for tracking food spending. Users log purchases by hand or paste receipt text copied using iPhone Live Text or Google Lens. This MVP has no AI and no image upload. Currency is USD only.

Read this whole file before coding. Build the specified scope. Resolve routine implementation choices using the simplest solution that satisfies these requirements. Ask only when a material conflict or missing requirement blocks safe implementation. Do not add features or dependencies without a concrete need and authorization.

## MVP scope

1. Email-link sign-up, sign-in, and sign-out using Supabase Auth.
2. Settings: weekly grocery budget, default $150; weekly meals-out limit, default 1; timezone, default America/Los_Angeles, editable using valid IANA timezone identifiers.
3. Add manually: amount, store, type (Groceries, Eating out, Convenience), date defaulting to today in the saved timezone, and optional note. Offer store autocomplete from distinct names on the user's own purchases. “Repeat last” copies the most recently created purchase's amount, store, type, and note; date resets to today. It never saves automatically.
4. Paste receipt: textarea, deterministic parser, and review before saving. Allow adding, removing, and editing items, quantities, unit prices, item savings, store, date, type, subtotal, receipt savings, tax, and total. Defaults: today in the saved timezone and Groceries. Do not infer a date or type from receipt text.
5. Home: food left this week, “$X of $Y spent”, progress bar, status word, meals out (“1 of 1”), Paste receipt and Add manually buttons, Settings and Sign out access, and five most recent purchases ordered by purchased_on descending, then created_at descending, then id.

Out of scope: price book, shopping lists, AI scanning, bank statements, image upload, account deletion, payments, saved store aliases, purchase history editing/deletion, and light theme. Receipt review occurs before the initial save.

## Stack and layout

- Next.js App Router, TypeScript strict, Tailwind CSS.
- Supabase Postgres, Auth, and row-level security, using @supabase/ssr and @supabase/supabase-js.
- Zod for server action validation; Vitest for unit tests.
- Vercel deployment from git. Commit the lockfile and document the supported Node version.
- No separate server, ORM, state management library, sharp, analytics, tracking scripts, or AI API.

Use the installed supported framework conventions for session refresh and request interception. Do not add both middleware.ts and proxy.ts for the same job.

```text
app/
  (auth)/sign-in/page.tsx
  auth/callback/route.ts
  page.tsx
  add/page.tsx
  paste/page.tsx
  settings/page.tsx
lib/
  supabase/server.ts
  supabase/browser.ts
  money.ts
  week.ts
  receipt-parser.ts
  receipt-parser.test.ts
  validation.ts
supabase/migrations/0001_mvp.sql
```

Add colocated action files and focused tests as necessary. Keep the receipt parser pure and independent of Next.js and Supabase.

## Data model: keep ownership simple

Use four tables. Store the store name directly on each purchase. Do not create a stores table or store foreign key. Derive autocomplete from the user's existing purchases. Item ownership comes from its parent purchase; do not duplicate user_id on items.

Use integer cents, bounded to 0–1,000,000 cents ($10,000) per amount, including budgets and totals. Negative purchase/item totals and returns are unsupported. Quantities must be greater than zero and at most 10,000, with at most three fractional digits. Limit receipt items to 200, store names to 120 characters, item names to 200, and notes to 1,000.

Create the following schema in 0001_mvp.sql. Extend that migration with the save function described below. This schema is a specification, not a prohibition on correcting security or integrity defects. Report any necessary departure.

```sql
create table public.profiles (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now()
);

create table public.food_budgets (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  grocery_weekly_cents integer not null default 15000
    check (grocery_weekly_cents between 0 and 1000000),
  meals_out_weekly integer not null default 1
    check (meals_out_weekly between 0 and 100)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  request_id uuid not null,
  store_name text not null
    check (char_length(btrim(store_name)) between 1 and 120),
  purchased_on date not null,
  type text not null check (type in ('groceries', 'eating_out', 'convenience')),
  subtotal_cents integer check (subtotal_cents between 0 and 1000000),
  savings_cents integer not null default 0
    check (savings_cents between 0 and 1000000),
  tax_cents integer check (tax_cents between 0 and 1000000),
  total_cents integer not null check (total_cents between 0 and 1000000),
  source text not null check (source in ('paste', 'manual')),
  math_check text not null default 'skipped'
    check (math_check in ('ok', 'mismatch', 'skipped')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index purchases_user_date
  on public.purchases(user_id, purchased_on desc, created_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  position integer not null check (position between 0 and 199),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  quantity numeric(8,3) not null default 1
    check (quantity > 0 and quantity <= 10000),
  unit_price_cents integer check (unit_price_cents between 0 and 1000000),
  line_total_cents integer not null check (line_total_cents between 0 and 1000000),
  savings_cents integer not null default 0
    check (savings_cents between 0 and 1000000),
  unique (purchase_id, position)
);

alter table public.profiles enable row level security;
alter table public.food_budgets enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy own_rows on public.profiles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on public.food_budgets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on public.purchases for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on public.purchase_items for all to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_items.purchase_id
      and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_items.purchase_id
      and p.user_id = (select auth.uid())
  ));

-- Explicit API privileges. RLS still restricts authenticated users to owned rows.
revoke all on public.profiles, public.food_budgets,
  public.purchases, public.purchase_items from public, anon;
grant select, insert, update, delete on public.profiles, public.food_budgets,
  public.purchases, public.purchase_items to authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.food_budgets (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

There is one current budget per user. Settings updates that row; changes apply immediately to the current week's display. Do not implement historical budgets. Validate timezone identifiers on the server using Intl.DateTimeFormat; invalid values must not be saved.

## Atomic saving and retries

Implement public.save_purchase as a PostgreSQL RPC function in the migration. Call it from an authenticated server action using that user's session. Use SECURITY INVOKER and an empty search_path; fully qualify database objects. Revoke function execution from PUBLIC and anon, then grant only authenticated. Do not use a service role or SECURITY DEFINER for saving.

The function accepts a request UUID and reviewed purchase/item values, never a user ID. Check auth.uid() is present. Inserts omit user_id so the database default supplies it.

- Save the purchase and all items in one transaction. Any error rolls everything back.
- Validate required fields, JSON shapes, number ranges, quantity precision, dates, item count, and string lengths in the function as well as in Zod. Do not silently round quantities or coerce missing values to zero.
- Manual purchases contain no items, null subtotal/tax, zero savings, and math_check skipped.
- Receipt purchases may have zero items if parsing failed, but require a reviewed total, store, date, and type. Recompute math_check from the reviewed values on the server/database; never trust a client-provided status.
- The reviewed total is authoritative for budget calculations. Item quantity or unit-price edits do not silently overwrite the line total; all three fields remain independently editable.
- Generate request_id once per new form. Retain it across failed submissions and retries. A successful save returns its purchase ID. Concurrent or repeated saves with the same (user_id, request_id) return the original purchase ID and never insert extra items. Do not overwrite an already saved receipt on retry.
- Keep the submit button disabled while a submission is pending. Preserve all review edits after errors. Clear the form or navigate Home only after confirmed success; refresh Home data.
- Display math mismatches as a plain warning. Permit saving the reviewed total. Never silently fix amounts.

Do not persist or log raw pasted receipt text. Persist only reviewed fields and reviewed item names; rawName is a transient parser field. Render text as text, never HTML.

## Security and authentication

1. Enable RLS and an ownership policy for every new table in the same migration. Parent ownership must cover every item operation, including reparenting.
2. All server actions and protected pages verify the current authenticated user through the supported server-side Supabase verification method. Do not authorize using an unverified cookie/session payload. RLS remains the database boundary.
3. Never accept user_id from a form or RPC argument. Never spread unchecked request objects into database writes.
4. The browser uses only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Do not use any service-role/secret key in this MVP or create an admin client.
5. Never hard-code keys. Ignore .env* except .env.example. Commit .env.example containing only empty NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY values. Real environment files stay untracked.
6. Validate every server action with Zod, including sign-in, settings, and saving. Limit email and text lengths. Money arrives as a decimal string; convert it to cents by splitting digits, never parseFloat or floating-point multiplication. Reject exponent notation, negative values, more than two fractional digits, unsafe integers, and values over the stated limit. Permit 12, 12.3, and 12.34 in forms. Parser prices require exactly two decimals.
7. Use a fixed, configured callback path for email links. The callback exchanges the code for a session and redirects to Home. Do not accept arbitrary external redirect targets. Use POST/server actions for mutations and sign-out. Retain framework origin/CSRF protections; do not implement state-changing GET routes.
8. Add X-Frame-Options: DENY, Referrer-Policy: no-referrer, and X-Content-Type-Options: nosniff. Implement a production CSP compatible with Next.js: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self' plus the exact configured HTTPS Supabase origin. Authorize required scripts with a fresh per-request nonce and wire it through the framework; do not allow unsafe-eval or unsafe-inline for production scripts. Inline styles may use unsafe-inline for framework compatibility. Allow only resources the app actually uses. Do not cache nonce-bearing HTML across requests. Document any development-only allowances.
9. Do not log pasted text, reviewed payloads, tokens, email links, or payment lines. Show generic action errors without leaking another user's records or internal SQL details.

## Receipt parser

A pure function parseReceipt(text: string): ParsedReceipt. No network, storage, framework, or database imports.

```ts
type ParsedItem = {
  rawName: string;
  lineTotalCents: number;
  quantity: number;
  unitPriceCents: number | null;
  savingsCents: number;
};
type ParsedReceipt = {
  storeName: string | null;
  items: ParsedItem[];
  subtotalCents: number | null;
  savingsCents: number;
  taxCents: number | null;
  totalCents: number | null;
  mathCheck: 'ok' | 'mismatch' | 'skipped';
};
```

### Parsing order and rules

1. Reject input over 10,000 characters with a controlled validation error. Trim lines and remove empty lines. Apply the same amount, item-count, and name-length limits used by saving; never truncate or discard excess items silently.
2. Remove private/payment lines before identifying stores, totals, items, or column layouts. Discard lines containing a masked card number (one or more * followed by four digits), eight or more consecutive digits, a phone number, or a whole-word match for AID, Chip, Debit, Credit, Visa, Paid, Change, Returns, or the phrase Sold Items, case-insensitively. Whole-word matching must not discard CREDITON MILK. No discarded line may appear in any output field, log, or persisted data. This is a heuristic filter, not a guarantee of identifying every possible payment format.
3. An amount token has optional $, digits, a dot, and exactly two decimal digits. It may be prefixed by minus or enclosed in parentheses to indicate a discount. A trailing F, T, or FT tax flag is allowed. Do not accept thousands separators or locale-specific decimals. Normalize savings/discount magnitudes to positive cents. Unsupported negative item totals must produce a controlled error, not become positive purchases.
4. Match totals by anchored labels, case-insensitively, allowing an optional colon. Check the longest labels first: Your Total Savings, Total Savings, Subtotal, Net Sales, Tax, Total. Use the last monetary amount on each totals line; percentages are not amounts. Totals lines are never items. Explicit Subtotal takes precedence over Net Sales regardless of order; use Net Sales only when no Subtotal exists. The last occurrence of each same label wins. Savings labels set receipt savings to a positive magnitude.
5. Detail lines start with Qty, Reg, or Savings, or contain @ or /lb. They attach only to the preceding item; they never create items or stores. Qty 2 $2.49 ea sets quantity 2 and unit price 249. Qty 2.84 lb @ $0.89/lb sets quantity 2.84 and unit price 89. Qty 1.81 lb Reg $2.69/lb sets quantity 1.81 but leaves unit price null because Reg is a reference price. Reg never replaces paid unit or line prices. Savings ($0.49) adds 49 to that item's savings. Ignore orphan detail lines.
6. For standard layout, any remaining line with non-empty text followed by a trailing amount token is an item. Text before that token is rawName; its amount is lineTotalCents. Default quantity is 1, unit price null, item savings zero. The first remaining non-detail, non-total, non-price-only text line before any item is the store guess. Additional header lines are ignored. Do not guess a store from an item or footer.
7. Attempt the column fallback only when standard layout finds no items. Support exactly this conservative layout: first eligible text line is the store; remaining eligible name-only lines form one contiguous name block; an equally sized contiguous price-only block follows; labeled totals follow that block. No detail lines, extra location/header lines, split totals, or interleaved blocks are supported in fallback. Pair names and prices in order only when this structure and counts match. Otherwise return zero items and keep independently recognized totals and store. Never pair a partial list or guess which header is a product.
8. Receipt savings: use an explicit receipt-savings label when present, including an explicit zero. Otherwise sum item savings. Never add the two together.
9. Math check: if there are items, a total, and a known tax, sum the integer line totals. Return ok if either sum + tax or sum - receipt savings + tax is within 2 cents of total; otherwise mismatch. If items, total, or tax are missing, return skipped. Missing tax remains null, not an assumed zero. The review screen allows entering zero tax explicitly. Subtotal is informational and is not added to item sums.
10. On review, recalculate math status whenever relevant fields change, using exactly the same pure helper as saving. Do not regenerate reviewed items from the original pasted text.

### Required fixture

```text
CORNER MARKET
Main Street 001
SMBZN OG ACAI BLND $8.99 F
LNDB OG ROC WHT JASMINE R $7.09 F
MVW SPRING WATER $3.59 FT
ALEXFF OG WHOLE A2 MILK $6.99 F
SIGGI STRAWB DRINK YOGURT $1.70 F
Reg $2.19
Savings ($0.49)
SIGGI MXD BRRY YGRT DRINK $1.70 F
Reg $2.19
Savings ($0.49)
CHOBANI CHRY BERRY YOGURT $4.98 F
Qty 2 $2.49 ea
CHOBANI STRWBRY KIWI YGRT $4.98 F
Qty 2 $2.49 ea
GURU OG LT ENRGY DRK $6.98 FT
Qty 2 $3.49 ea
OG BANANA $2.53 F
Qty 2.84 lb @ $0.89/lb
CLASSIC ROTI CHICKEN $8.99 FT
ORGRNC OG GRND BEEF 93/7 $9.89 F
Reg $11.49
Savings ($1.60)
OG SWEETANGO APPLE $2.90 F
Qty 0.91 lb @ $3.19/lb
OG GALA APPLE $4.00 F
Qty 1.81 lb Reg $2.69/lb
Savings ($0.87)
Subtotal: $78.76
Total Savings: -$3.45
Net Sales: $75.31
Tax: 10.55% $2.06
Total: $77.37
Sold Items: 17
Debit *0000 $77.37
Chip Card AID:A0000000000000
```

Expected: store CORNER MARKET; 14 items; first item SMBZN OG ACAI BLND at 899; Chobani cherry quantity 2 and unit price 249; beef savings 160; subtotal 7876; savings 345; tax 206; total 7737; item sum 7531; mathCheck ok. No field contains 0000 or AID.

### Exact supported column fixture

```text
CORNER MARKET
APPLES
BREAD
$3.00
$4.00
Subtotal: $7.00
Tax: $0.00
Total: $7.00
```

Expected: store CORNER MARKET; APPLES at 300 and BREAD at 400; subtotal 700; savings 0; tax 0; total 700; mathCheck ok. A version with an extra location header or one missing item price must return zero items, not shifted pairs.

Also test: no total; missing tax; explicit zero tax; mismatch; input over 10,000 characters; signed and parenthesized savings; subtotal precedence in both orders; item-savings fallback; no double-counting of savings; weighted quantities; private lines excluded from store guesses and column fallback; whole-word filtering; unsupported negative item amounts; oversized amounts and item counts.

## Dates and calculations

- Use YYYY-MM-DD calendar dates for purchases. Validate real dates; reject future dates in the saved timezone. Do not convert a purchased_on date through UTC when displaying it.
- Compute today's calendar date in profiles.timezone using Intl.DateTimeFormat. Derive the local Monday date and the following Monday date with calendar arithmetic. Query purchased_on >= Monday and < next Monday. This avoids DST and end-of-day timestamp issues. Test Sunday/Monday boundaries and DST weeks.
- Food spent = sum total_cents of this week's groceries and convenience purchases. Food left = current weekly grocery budget minus food spent; negative values are valid.
- Meals out = count of this week's eating_out purchases; each purchase counts as one meal out regardless of amount or item count. Eating out does not reduce the grocery budget.
- Let d be the local weekday with Monday = 1 and Sunday = 7. On track when spent × 7 <= budget × d. Otherwise Watch when spent <= budget. Otherwise show “Over by $X”. At exactly the full budget before Sunday the status is Watch; on Sunday it is On track.
- A zero budget and zero spent is On track. Any positive spend with a zero budget is Over by $X. Avoid division by zero. Clamp the visual progress bar to 0–100%; retain the true amounts in text. Show a full bar when budget is zero and spent is positive, and an empty bar when both are zero.
- Format USD consistently with cents, using integer-cent inputs. “Food left this week” provides the hero context; place “$X of $Y spent” next to it. Meals show “X of Y”. All calendar calculations use the saved timezone, never the server's default timezone.

## Design and behavior

- Dark theme only for this MVP: background #0B0B0C, cards #17171A, text #F5F5F5, secondary text #B8B8BE or brighter.
- Status colors always paired with words: On track #3DDC84, Watch #FFC24B, Over #FF5A5A. Accent #4C8DFF for actions only. Choose button text colors that meet WCAG AA against their backgrounds.
- System font stack. Hero 48–56 px, bold. Body at least 17 px. tabular-nums on every amount.
- One column on every screen. Tap targets at least 44 px. Visible focus, real labels, keyboard operation, and reduced-motion support. Use inputmode="decimal" for money; validate the string rather than relying on number-input coercion.
- App name Ledger. No dollar-sign logos or money imagery.
- Plain sentences, no em dashes, exclamation marks, or shaming.
- Empty Home explains how to add a first purchase. Empty autocomplete accepts a new name. Sign-in shows a neutral email-sent result. Expired links and failed saves offer a clear retry. Preserve typed values after validation or network failures; do not persist drafts or pasted text in localStorage.

## Required verification

Provide scripts that make these commands pass:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

After build, scan browser output for accidental secret key material:

```sh
rg -n 'service_role|sb_secret' .next/static
```

No output is the required result; rg exit code 1 means no matches. If rg is unavailable, use grep -rE. This scan supplements code review; it does not prove all secrets are absent.

Unit tests must cover parser rules, money parsing and bounds, week/status boundaries, and reviewed-receipt math. Keep tests focused on behavior.

Using a disposable Supabase environment with two ordinary authenticated users, verify database behavior directly, not only through hidden UI controls:

1. Each user sees only their own profiles, budget, purchases, items, and autocomplete names. Unauthenticated users cannot read or mutate them.
2. User B cannot select, update, delete, insert an item under, or reparent an item into User A's purchase, even with its exact UUID. No service role is used for these checks.
3. A receipt save containing an invalid item rolls back the parent and all items.
4. Repeating a request UUID, including concurrent requests, produces one purchase and one set of items.
5. Invalid RPC inputs fail even when bypassing Zod.

Manual acceptance flow: new email-link user; change budget and timezone; add a manual purchase; Repeat last without auto-saving; paste the fixture; edit an item and its total as needed; save; verify Home; test a failed save and retry; sign out; sign in as the second user and verify isolation. Check keyboard use and the production CSP for blocked required resources.

Do not claim checks passed unless run. If live Auth, database, deployment, or email testing is blocked by missing configuration, finish local work and report the exact remaining checks and setup.

## Definition of done and handoff

The acceptance flow works, database isolation and atomic saves are verified, and required local commands pass. No out-of-scope features are added.

Report what was built, necessary departures and why, verification results, and exactly what the human must still do:

- Create/configure the Supabase project and apply the migration.
- Enable email-link Auth and configure the email template/delivery settings required by the chosen flow.
- Set the Supabase Site URL and allowlisted local/production callback URLs to match app/auth behavior.
- Set the two public Supabase environment variables locally and in Vercel.
- Connect the repository to Vercel and verify the production sign-in and CSP flow.

Perform already authorized setup when access exists. Never fabricate successful deployment or leave a required setup step implicit.
