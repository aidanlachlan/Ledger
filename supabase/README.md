# Ledger database

Apply every file in `migrations/` once, in filename order (`0001` to `0004`),
to a new Supabase project through Supabase's migration tooling or SQL editor.
`0001_mvp.sql` creates `profiles`, `food_budgets`, `purchases`, and
`purchase_items`, plus ownership RLS policies, auth-user initialization,
timezone validation, and the `public.save_purchase` RPC. `0002` allows items on
manual purchases, `0003` adds the `public.update_purchase` RPC, and `0004` adds
the read-only `budget_history` table used by the History page. No service-role key is needed by the application.

The RPC is called as the signed-in user, with named arguments:

```ts
supabase.rpc('save_purchase', { p_payload: reviewedPurchase, p_request_id: requestId })
```

`p_payload` must be a JSON object containing **exactly** these camelCase keys:

```json
{
  "storeName": "Market",
  "purchasedOn": "2026-10-15",
  "type": "groceries",
  "subtotalCents": 650,
  "savingsCents": 50,
  "taxCents": 0,
  "totalCents": 600,
  "source": "paste",
  "note": null,
  "items": [
    {
      "name": "Example",
      "quantity": 1,
      "unitPriceCents": null,
      "lineTotalCents": 600,
      "savingsCents": 50
    }
  ]
}
```

Use `type` values `groceries`, `eating_out`, or `convenience`; source is
`manual` or `paste`. For manual purchases use `items: []`, `subtotalCents: null`,
`taxCents: null`, and `savingsCents: 0`. The RPC returns a **single UUID**,
not a result object or a JSON row. Never pass a user ID. Generate a fresh
`p_request_id` per new form and reuse it unchanged for retries. RPC retries do
not update a previously inserted receipt. The reviewed `totalCents` remains
authoritative even when `math_check` is `mismatch`.

## Local SQL verification

Requires PostgreSQL 14+ client and server commands (`psql`, `initdb`, `pg_ctl`)
and Bash. Run from the repository root:

```sh
bash supabase/tests/run_local.sh
```

The script starts its **own short-lived cluster** using a Unix socket in a
private temporary directory, with stub `auth.users`, roles, and `auth.uid()`.
It applies the real migration and directly exercises two authenticated user
IDs, RLS and unauthorized mutations, math, date validation, invalid JSON,
transaction rollback, exact quantity precision, and a parallel same-UUID
submission while the first transaction holds the insert lock. It stops and
deletes the isolated cluster on exit. It does not connect to or modify an
existing PostgreSQL or Supabase instance.

**Limits:** Stubbed Auth/RLS tests are not a substitute for a disposable
Supabase project with real email-link users and API requests. Repeat the
two-user isolation, privileges, and concurrent RPC tests there before launch.
The browser, deployment, email delivery, and production CSP are tested in the
application, not by this database script.

## Intentional schema correction

The requested `quantity numeric(8,3)` would silently round direct SQL writes
such as `1.2345` to `1.235` *before* a check constraint sees the value. The
column uses `numeric` with explicit limits and a maximum-three-decimal-places
check instead. Every other field retains the requested model. This prevents
precision loss even when somebody bypasses the application and RPC.

Settings updates must still validate timezone identifiers using
`Intl.DateTimeFormat` in the server action. The database additionally checks
timezone names against PostgreSQL's timezone catalog. The authenticated
table grants follow the brief, so the application must use the RPC for
atomic saves; RLS prevents cross-user access but does not force all
same-user direct table writes through the RPC.
