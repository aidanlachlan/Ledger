# Ledger

**Know where your money goes, week by week.** Ledger is a personal finance tracker that starts with food, the spending that's easiest to lose track of. Today it tracks grocery spending against a weekly budget and counts meals out; more categories, income and bills are on the [roadmap](#roadmap).

**Try it: [www.calmledger.app](https://www.calmledger.app)**

<p align="center">
  <img src="docs/screenshots/home.png" width="360" alt="Ledger's Home screen: $50.32 of food budget left this week, $99.68 of $150.00 spent, marked On track; 0 of 1 meals out; buttons to paste a receipt or add a purchase manually.">
  <img src="docs/screenshots/purchase.png" width="360" alt="A saved receipt purchase: Whole Foods Market, $77.37, with its parsed items, prices, quantities and savings.">
</p>
<p align="center">
  <img src="docs/screenshots/recent.png" width="360" alt="The recent purchases list: four purchases with store, amount, type and date.">
  <img src="docs/screenshots/history.png" width="360" alt="The weekly history chart: this week's spending bar at $99.68 against a dashed $150 budget line, with a table view below.">
</p>

## Features

- **Weekly budget at a glance:** what's left, a progress bar, whether you're on track for the day of the week, meals out against your limits, and your total spending.
- **Quick manual entry** with store autocomplete and **Repeat last**. Items are optional.
- **Scan a receipt** ([how](#scanning-a-receipt)): take or choose a photo and Ledger reads it on your phone, then pulls out the store, items, quantities, savings, tax and total, checks that the items add up, and lets you fix anything before saving. If a receipt doesn't read cleanly, Ledger says so instead of guessing.
- **Paste a receipt** as a fallback: paste text copied with Live Text or Google Lens, and it goes through the same checks.
- **Edit and delete** any saved purchase.
- **History:** spending per week or per day, each against the budget you had at the time, plus meals out per week.
- **All purchases:** every purchase, newest first, with store search.
- **Settings:** weekly food budget, meals-out count and optional dollar budget, and timezone. Weeks run Monday to Sunday in your timezone.
- **Sign in** with email and password, or a one-time email link. Forgot your password? A reset link takes you straight to choosing a new one, and changing your password signs out your other devices.

## Scanning a receipt

Tap **Scan receipt**, then take or choose a photo. For the best read, lay the receipt flat on a dark surface, fill the frame, and avoid shadows and creases.

Ledger crops the photo to the receipt, cleans it up and reads it with [Tesseract](https://github.com/naptha/tesseract.js), all on your device. The first scan downloads the reader (about 7 MB); after that it is cached. Then it checks the items against the receipt total:

- If they add up, you review and save.
- If a price can't be read, it is left blank, and Ledger tells you what it would be if every other amount is right.
- If the items don't add up or no total is found, Ledger warns you. You can fix the amounts or just save the total.

Some receipts print a multi-buy's price on the line below its name (`1 @ 4 FOR $5.00   $1.25`); Ledger reads those too, and works out an unreadable line price from its deal.

**Pasting instead:** copy the receipt's text from a photo (iPhone: Live Text, then **Select All** and **Copy**; Android: Google Lens, **Text**, **Copy text**), tap **Paste receipt text instead** on the scan page, and paste. Live Text can copy wide receipts column by column, which scrambles them; scanning avoids that.

## Tech stack

- [Next.js](https://nextjs.org) (App Router, Server Actions) with strict TypeScript
- [Supabase](https://supabase.com): Postgres, Auth and row-level security
- [Zod](https://zod.dev) for validation, [Tailwind CSS](https://tailwindcss.com) for styling
- [Tesseract.js](https://github.com/naptha/tesseract.js) for on-device receipt OCR
- [Vitest](https://vitest.dev), plus a PostgreSQL test runner for the database
- Deployed on [Vercel](https://vercel.com)

No ORM, no separate API server, no analytics or tracking scripts.

## Engineering highlights

- **Receipts stay private.** Photos are read and parsed in the browser; the OCR engine is served from Ledger itself, not a CDN. The photo and raw text are never uploaded or stored, and lines that look like card numbers or phone numbers are dropped first. Only the values you review are saved.
- **Saves are safe to retry.** A purchase and its items save in one transaction, keyed by a per-form request ID. Pressing Save again after a dropped connection returns the original purchase, never a duplicate, even when two saves arrive at once.
- **The database checks everything.** Postgres validates every purchase itself and computes the receipt math check, so a hand-crafted request can't store invalid data.
- **Users only ever see their own data.** Row-level security restricts every table to its owner. The app uses only the public key; there is no service-role key.
- **Locked-down pages.** A strict Content Security Policy with a fresh nonce per request (no inline scripts, no `eval`), no-store caching, and auth redirects that never trust the request's Host header. The only exception is the OCR worker under `/ocr`, which may compile WebAssembly (`'wasm-unsafe-eval'`) and nothing else.
- **Money is exact:** integer cents end to end, never floating-point dollars.
- **Accessible:** labelled fields, visible keyboard focus, a skip link, and charts that can be read as tables.

## Running locally

Requires Node 24 and a Supabase project.

```sh
nvm use
npm ci                       # also copies the OCR engine into public/ocr
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev
```

Supabase and Vercel setup, including migrations and auth settings: [docs/SETUP.md](docs/SETUP.md).

## Testing

```sh
npm run typecheck
npm run lint
npm test          # unit tests: receipt parser, scan image cleanup, validation, weeks, history
npm run test:db   # database tests (needs local PostgreSQL: initdb, pg_ctl, psql)
```

Every push runs typecheck, lint, unit tests and a production build in GitHub Actions.

The database tests run the real migrations on a throwaway PostgreSQL cluster, deleted afterwards, and cover two-user isolation, validation, rollback, concurrent duplicate saves, editing, deleting and budget history. What has and hasn't been verified: [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Roadmap

Growing Ledger into a full personal finance tracker:

- Spending categories beyond food, each with a budget
- Income, and monthly as well as weekly budgets
- Recurring bills and subscriptions
- Bank statements read from cropped text in the browser, like receipts: the raw statement never leaves your device
- Reports and trends across categories

## How it was built

The first version was built from my [MVP brief](docs/MVP-brief.md) using a custom ChatGPT-based coding harness. I then audited and refactored it with [Claude Code](https://claude.com/claude-code). I set the requirements, reviewed the design, and directed the audit and refactor.
