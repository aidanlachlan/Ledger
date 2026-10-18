# Ledger: MVP brief

> The original brief for the first version, kept for reference. Ledger has since grown beyond it, with password sign-in, editing and deleting purchases, and weekly history. See the [README](../README.md) for what it does today.

## Goal

A simple web app for tracking food spending against a weekly budget. People log purchases by hand, or paste receipt text copied with iPhone Live Text or Google Lens. USD only, no AI, no image upload.

## Scope

1. **Accounts:** email-link sign-up, sign-in and sign-out.
2. **Settings:** weekly grocery budget (default $150), weekly meals-out limit (default 1), and timezone (default America/Los_Angeles).
3. **Add manually:** amount, store, type (Groceries, Eating out or Convenience), date (default today) and an optional note. Store names autocomplete from your own past purchases. **Repeat last** copies the most recent purchase with today's date, and never saves on its own.
4. **Paste a receipt:** the text is parsed into store, items and totals, and everything can be reviewed and edited before saving. Date and type are never guessed from the receipt.
5. **Home:** food left this week, "$X of $Y spent", a progress bar and status, meals out ("1 of 1"), and the five most recent purchases.

Out of scope for the MVP: AI scanning, image upload, bank statements, payments, shopping lists, price tracking, account deletion, editing saved purchases, and a light theme.

## How the week works

- Weeks run Monday to Sunday in the user's timezone.
- **Food spent** is groceries plus convenience. **Food left** is the budget minus food spent, and can go negative.
- **Meals out** counts eating-out purchases, one per purchase whatever it costs. Eating out doesn't use the grocery budget.
- **Status:** *On track* while spending is within the budget prorated to the day of the week (on Wednesday, 3/7 of the budget). *Watch* above that but within budget. *Over by $X* past the budget.
- The current budget applies to the current week. *(History of past budgets was added later.)*

## Receipts

- Parsing happens in the browser. The raw text is never sent to a server, logged or stored; only reviewed values are saved.
- Lines that look private (masked card numbers, long digit strings, phone numbers, and payment words such as Debit, Visa or AID) are dropped before anything else is read.
- Totals are read from labelled lines (Subtotal, Net Sales, Savings, Tax, Total). Detail lines (`Qty`, `Reg`, `Savings`, `@`, `/lb`) attach quantity, unit price and savings to the item above.
- A simple two-column layout (all names, then all prices) is supported only when the counts match exactly; otherwise no items are guessed.
- **Math check:** items plus tax should match the total, with or without savings, within 2 cents. A mismatch is a warning, not a block: the reviewed total is what counts.

### Test receipt

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

Expected: store CORNER MARKET, 14 items summing to $75.31, subtotal $78.76, savings $3.45, tax $2.06, total $77.37, math check ok. The payment lines don't appear anywhere.

## Requirements

- **Data:** four tables (profiles, budgets, purchases, purchase items). Money is stored as integer cents, up to $10,000 per amount. Store names live on each purchase; there is no stores table.
- **Privacy and security:** every table is restricted to its owner with row-level security. The app uses only the public Supabase key. Every action checks the signed-in user on the server, and input is validated both in the app and in the database.
- **Reliable saves:** a purchase and its items save together or not at all, and retrying the same form never creates a duplicate.
- **Pages:** a strict Content Security Policy with no inline scripts, and no clickjacking or referrer leaks.
- **Design:** dark theme, one column, at least 44 px tap targets, visible focus, real labels and full keyboard use. Status colors always come with words. Plain, friendly wording with no shaming.
- **Stack:** Next.js, TypeScript, Tailwind, Supabase, Zod and Vitest, deployed on Vercel. No ORM, separate server, analytics or AI.
