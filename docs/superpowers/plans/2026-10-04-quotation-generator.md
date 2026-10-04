# Quotation Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin Quotes module that builds a customer quote by hand, from a flyer image, or by copying a package, and downloads it as a PDF identical in layout to a package's "Download Full Itinerary".

**Architecture:** Quotes live in their own `quotes` table (itinerary content as jsonb, frozen at save time) behind a new `can_manage_quotes` permission. Packages and quotes share one zod content schema, one set of form-section components, one form-import hook, one poster-extraction core, and one react-pdf template — so the quote PDF cannot drift from the package PDF.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres + RLS, react-hook-form + zod 4, shadcn/ui on Base UI, `@react-pdf/renderer`, `@anthropic-ai/sdk`, `tsx` verify scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-quotation-generator-design.md`

## Global Constraints

- Quote PDF layout is 100% the itinerary PDF: same header, sections, order, styles, footer. No quote number or customer name printed on it.
- Quote numbers: `TSQ-` + 6-digit zero-padded sequence (`TSQ-000001`), assigned by the database, never by the client.
- Permission: `can_manage_quotes` (profiles column, `has_permission()` branch, `Permission` union, users form toggle labelled "Manage Quotes", users table badge "Quotes"). Admin role always passes.
- CRM contact link is optional. Output is PDF download only — no email/send.
- Pricing model is the package model: `price_per_pax` (integer > 0) + optional `discount_amount` (> 0, shown as struck-through `price + discount`) + optional per-travel-date-range `additionalFee`.
- At least one travel date is required on a quote (same rule as packages).
- Package behavior must not change: package form, poster import, package PDFs (public and admin) render exactly as before.
- Next.js 16: page `params` and `searchParams` are Promises (`await params`). Read `node_modules/next/dist/docs/` before using any API not already used in this repo.
- Never install `@supabase/auth-helpers-nextjs`; no new npm dependencies are needed for this plan.
- Tests in this repo are `scripts/verify-*.ts` run with `tsx`, each registered as an `npm run verify:*` script, printing PASS/FAIL per check and exiting 1 on any failure.

## Local Environment Notes (read before Task 1)

- `.env.local` points at a **remote** Supabase project. New migrations are applied to the **local** stack only. Live verify scripts must be pointed at the local stack by prefixing env vars (Node's `--env-file` never overrides variables already set):
  ```bash
  eval "$(npx supabase status -o env | sed -n 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
  ```
  Run that once per shell before any live `npm run verify:*` command in this plan. If `npx supabase status -o env` prints different key names, map them by hand (`npx supabase status` lists API URL, anon key, service_role key).
- If `npx supabase start` fails on ports 54321–54327, another project's stack may hold them: `docker ps --format '{{.Names}}\t{{.Ports}}'`. Ask the user before stopping someone else's containers.

## Review Focus

1. **Dirty form + second import** (flyer after typing, or copying a package after a flyer import) — must ask "Replace what you've entered?" and never silently wipe typed content. Covered by Task 5's manual regression on packages and Task 8 Step 6 for quotes.
2. **Stored jsonb that no longer matches the schema** (hand-edited row, future schema change) — opening the quote or its PDF must fail loudly (error boundary / 500 with a logged message), never render a half-empty PDF. Pinned by Task 4's corrupt-jsonb check.
3. **Copying a package with optional fields empty** (no discount, no remarks, no exclusions, a date range with no fee) — values must round-trip to the quote with `undefined`/absent, not `null`/`0`, so the form validates and the PDF hides those sections. Pinned by Task 4's package→quote equality check using a sparse fixture.
4. **Staff without `can_manage_quotes`** calling quote actions directly or hitting `/admin/quotes/*` URLs — server actions throw Forbidden, pages render the forbidden page, RLS returns zero rows. Pinned by Task 1's RLS script and Task 8 Step 6.
5. **Flyer-mapped values containing `undefined` keys** — spreading `{ ...EMPTY, ...values }` with an `undefined` value would blank a default (e.g. `travelDates: undefined` crashes `useFieldArray`). Pinned by Task 6's "no undefined keys" check.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261004120000_create_quotes_schema.sql` | `quotes` table, quote-number sequence/trigger, RLS, `can_manage_quotes` permission wiring |
| `types/database.ts` | Regenerated Supabase types |
| `components/admin/itinerary-content-schema.ts` | Shared zod schema + empty defaults for the itinerary content both forms edit |
| `components/admin/package-form-schema.ts` | Package schema = shared content + name + destination |
| `components/admin/quote-form-schema.ts` | Quote schema = shared content + title + customer + contact |
| `lib/packages/package-content.ts` | Pure: package row (+children) → `ItineraryContentValues` |
| `lib/quotes/quote-row.ts` | Pure: quote form values ↔ `quotes` row (jsonb parse/serialize) |
| `lib/quotes/poster-mapping.ts` | Pure: poster extraction → quote form values |
| `lib/pdf/itinerary-pdf.tsx` | The one react-pdf template (moved from package-pdf.tsx) |
| `lib/pdf/package-pdf.tsx` | Package fetch + adapter onto the shared template |
| `lib/pdf/quote-pdf.ts` | Quote fetch + adapter onto the shared template |
| `lib/packages/extract-poster.ts` | Server-only: validate image, call Claude, return raw `PosterExtraction` |
| `actions/package-poster.ts` | Package flyer action (permission + destinations + package mapper) |
| `actions/quote-poster.ts` | Quote flyer action (permission + quote mapper) |
| `actions/quotes.ts` | create/update/delete quote, copy-from-package values |
| `components/admin/itinerary-fields/*.tsx` | Shared form sections: details pricing fields, travel dates, itinerary days, label lists, remove-confirmation |
| `components/admin/use-form-import.tsx` | Shared hook: apply an import (flyer/package) to a form with dirty-check confirmation |
| `components/admin/poster-import-context.tsx` | Context generalized to any form import |
| `components/admin/poster-import-button.tsx` | Button generalized: injectable action + noun |
| `components/admin/quote-form.tsx` | Quote create/edit form |
| `components/admin/quote-package-picker.tsx` | "Copy from a package" combobox |
| `components/admin/quote-table.tsx` | Quotes list with open/download/delete |
| `app/admin/(dashboard)/quotes/**` | List, new, edit pages; PDF route |
| `scripts/verify-quote-rls.ts`, `verify-quote-values.ts`, `verify-quote-pdf.ts` | Verification |

---

### Task 1: Quotes schema, quote numbers, `can_manage_quotes` permission

**Files:**
- Create: `supabase/migrations/20261004120000_create_quotes_schema.sql`
- Create: `scripts/verify-quote-rls.ts`
- Modify: `types/database.ts` (regenerated)
- Modify: `package.json` (scripts)
- Modify: `lib/auth/dal.ts:11-15`
- Modify: `components/admin/account-form-schema.ts:9-16`
- Modify: `components/admin/account-form.tsx` (create defaults ~line 79, create switch after ~line 262, edit defaults ~line 295, edit switch after ~line 457)
- Modify: `actions/users.ts` (`AccountInput` ~line 35, both `.update({...})` calls ~lines 88 and 147)
- Modify: `components/admin/users-table.tsx` (both badge groups, ~lines 194 and 294)

**Interfaces:**
- Produces: table `quotes` with columns `id uuid, quote_no text, title text, customer_name text|null, contact_id uuid|null, source 'manual'|'flyer'|'package', source_package_id uuid|null, price_per_pax integer, discount_amount numeric|null, duration_label text, remarks text|null, travel_dates jsonb, itinerary jsonb, inclusions jsonb, exclusions jsonb, bring_items jsonb, created_by uuid|null, created_at, updated_at`. `Tables<"quotes">` / `TablesInsert<"quotes">` in `types/database.ts` (`quote_no`, `source`, jsonb columns, `created_by` optional on insert).
- Produces: `Permission` union includes `"can_manage_quotes"`; `profiles.can_manage_quotes boolean`.

- [ ] **Step 1: Write the failing RLS verification script**

Create `scripts/verify-quote-rls.ts`:

```ts
/**
 * Proves quotes' RLS is fully can_manage_quotes-gated and that quote_no is
 * always database-assigned. Creates two disposable staff accounts (one
 * without, one with can_manage_quotes), signs each in through the anon key
 * exactly like the browser would, and exercises select/insert/update/delete.
 * Always deletes its disposable rows and accounts in a finally block.
 *
 * Run via `npm run verify:quote-rls` against a project with the quotes
 * migration applied (the local stack -- see the plan's Local Environment
 * Notes; .env.local defaults to a remote project).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. " +
      "Point them at a project with the quotes migration applied, then run `npm run verify:quote-rls`."
  );
}

/** Same Node 20 WebSocket polyfill as scripts/verify-upsell-rls.ts. */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;

const QUOTE_FIXTURE = {
  title: "RLS fixture quote",
  price_per_pax: 1000,
  duration_label: "1 day",
};

async function signedInClient(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  await ensureWebSocketPolyfill();

  const service = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  });

  const results: CheckResult[] = [];
  const userIds: string[] = [];
  const quoteIds: string[] = [];
  const stamp = Date.now();
  const password = `Verify-${stamp}-pw`;

  try {
    const makeUser = async (label: string) => {
      const email = `verify-quote-rls-${label}-${stamp}@example.com`;
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
      userIds.push(data.user.id);
      return { id: data.user.id, email };
    };

    const denied = await makeUser("denied");
    const allowed = await makeUser("allowed");

    // handle_new_user() creates both profiles with every permission false.
    const { error: grantError } = await service
      .from("profiles")
      .update({ can_manage_quotes: true })
      .eq("id", allowed.id);
    if (grantError) throw new Error(`grant can_manage_quotes failed: ${grantError.message}`);

    // A row the denied user must not be able to see/update/delete.
    const { data: seeded, error: seedError } = await service
      .from("quotes")
      .insert({ ...QUOTE_FIXTURE, quote_no: "HACK-1" })
      .select("id, quote_no")
      .single();
    if (seedError || !seeded) throw new Error(`seed insert failed: ${seedError?.message}`);
    quoteIds.push(seeded.id);

    results.push({
      name: "quote_no is database-assigned even when the client supplies one",
      pass: /^TSQ-\d{6}$/.test(seeded.quote_no),
      detail: `quote_no=${seeded.quote_no}`,
    });

    const deniedClient = await signedInClient(denied.email, password);
    const allowedClient = await signedInClient(allowed.email, password);

    const { data: deniedRows, error: deniedSelectError } = await deniedClient
      .from("quotes")
      .select("id")
      .eq("id", seeded.id);
    results.push({
      name: "staff without can_manage_quotes cannot read quotes",
      pass: !deniedSelectError && (deniedRows ?? []).length === 0,
      detail: `rows=${deniedRows?.length ?? "n/a"} error=${deniedSelectError?.message ?? "none"}`,
    });

    const { error: deniedInsertError } = await deniedClient.from("quotes").insert(QUOTE_FIXTURE);
    results.push({
      name: "staff without can_manage_quotes cannot insert quotes",
      pass: !!deniedInsertError,
      detail: deniedInsertError ? `rejected: ${deniedInsertError.message}` : "insert unexpectedly succeeded",
    });

    const { data: deniedUpdated } = await deniedClient
      .from("quotes")
      .update({ title: "hacked" })
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff without can_manage_quotes cannot update quotes",
      pass: (deniedUpdated ?? []).length === 0,
      detail: `updated rows=${deniedUpdated?.length ?? 0}`,
    });

    const { data: deniedDeleted } = await deniedClient
      .from("quotes")
      .delete()
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff without can_manage_quotes cannot delete quotes",
      pass: (deniedDeleted ?? []).length === 0,
      detail: `deleted rows=${deniedDeleted?.length ?? 0}`,
    });

    const { data: allowedInsert, error: allowedInsertError } = await allowedClient
      .from("quotes")
      .insert(QUOTE_FIXTURE)
      .select("id, quote_no, created_by")
      .single();
    if (allowedInsert) quoteIds.push(allowedInsert.id);
    results.push({
      name: "staff with can_manage_quotes can insert, and created_by defaults to them",
      pass: !allowedInsertError && allowedInsert?.created_by === allowed.id,
      detail: allowedInsertError
        ? `error: ${allowedInsertError.message}`
        : `quote_no=${allowedInsert?.quote_no} created_by=${allowedInsert?.created_by}`,
    });

    const { data: allowedRows } = await allowedClient.from("quotes").select("id").eq("id", seeded.id);
    results.push({
      name: "staff with can_manage_quotes can read quotes",
      pass: (allowedRows ?? []).length === 1,
      detail: `rows=${allowedRows?.length ?? 0}`,
    });

    const { data: allowedUpdated } = await allowedClient
      .from("quotes")
      .update({ title: "renamed" })
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff with can_manage_quotes can update quotes",
      pass: (allowedUpdated ?? []).length === 1,
      detail: `updated rows=${allowedUpdated?.length ?? 0}`,
    });

    const { data: allowedDeleted } = await allowedClient
      .from("quotes")
      .delete()
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff with can_manage_quotes can delete quotes",
      pass: (allowedDeleted ?? []).length === 1,
      detail: `deleted rows=${allowedDeleted?.length ?? 0}`,
    });
  } finally {
    if (quoteIds.length > 0) {
      await service.from("quotes").delete().in("id", quoteIds);
    }
    for (const id of userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.error(`WARNING: failed to delete disposable user ${id}: ${error.message}`);
    }
  }

  console.log("\nverify-quote-rls\n");
  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-quote-rls failed:", err);
  process.exit(1);
});
```

Add to `package.json` `scripts` (after `verify:shuffle`, keep the trailing-comma rules of JSON):

```json
"verify:quote-rls": "tsx --env-file=.env.local scripts/verify-quote-rls.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run (after exporting local-stack env vars per Local Environment Notes): `npm run verify:quote-rls`
Expected: FAIL — TypeScript/tsx may run anyway (types are erased), and the first DB call errors with `relation "public.quotes" does not exist` or `column "can_manage_quotes" ... does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261004120000_create_quotes_schema.sql`:

```sql
-- Quotes: customer-specific itinerary quotations, rendered through the same
-- PDF template as a package's "Download Full Itinerary"
-- (docs/superpowers/specs/2026-10-04-quotation-generator-design.md).
--
-- (1) `quotes` -- one row per quote. Deliberately NOT child tables like
--     packages' itinerary_days/package_inclusions/package_travel_dates: a
--     quote is a frozen document written as one row in one statement, so
--     its itinerary content lives in jsonb columns whose shape is enforced
--     by quoteFormSchema (components/admin/quote-form-schema.ts) on every
--     write and re-parsed on every read (lib/quotes/quote-row.ts). jsonb
--     keys use the form's camelCase shape so values round-trip unchanged.
--     contact_id/source_package_id are optional links, `on delete set null`
--     so removing a contact or package never removes a quote.
-- (2) quote_no -- TSQ-000001, same sequence+trigger shape as packages'
--     generate_package_code() (20260807180000_package_fields_rework.sql):
--     any client-supplied value is overwritten. The column's '' default
--     exists only so the generated Insert type marks it optional.
-- (3) `can_manage_quotes` permission column + has_permission() branch +
--     handle_new_user() default -- same wiring as can_manage_vouchers
--     (20260928120000_create_vouchers_schema.sql).
--
-- RLS is fully can_manage_quotes-gated, read included (least privilege,
-- like vouchers). Hard delete is allowed: quotes carry no history any other
-- record depends on.

-- ============================================================================
-- (3, first) can_manage_quotes permission -- the RLS policies below call
-- has_permission(..., 'can_manage_quotes'), so wire it before them.
-- ============================================================================
alter table profiles add column can_manage_quotes boolean not null default false;

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  select
    is_active and (role = 'admin' or
      case perm
        when 'can_manage_packages' then can_manage_packages
        when 'can_message_customers' then can_message_customers
        when 'can_edit_crm' then can_edit_crm
        when 'can_manage_vouchers' then can_manage_vouchers
        when 'can_manage_quotes' then can_manage_quotes
        else false
      end)
  into result
  from profiles
  where id = uid;

  return coalesce(result, false);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, is_active, can_message_customers, can_manage_packages, can_edit_crm, can_manage_vouchers, can_manage_quotes)
  values (new.id, new.email, 'staff', true, false, false, false, false, false);
  return new;
end;
$$;

-- ============================================================================
-- (1) quotes
-- ============================================================================
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique not null default '',
  title text not null,
  customer_name text,
  contact_id uuid references contacts(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'flyer', 'package')),
  source_package_id uuid references packages(id) on delete set null,
  price_per_pax integer not null check (price_per_pax > 0),
  discount_amount numeric check (discount_amount is null or discount_amount > 0),
  duration_label text not null,
  remarks text,
  travel_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(travel_dates) = 'array'),
  itinerary jsonb not null default '[]'::jsonb check (jsonb_typeof(itinerary) = 'array'),
  inclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(inclusions) = 'array'),
  exclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusions) = 'array'),
  bring_items jsonb not null default '[]'::jsonb check (jsonb_typeof(bring_items) = 'array'),
  -- set null, not restrict: deleting a staff account must never be blocked
  -- by (or delete) the quotes they made.
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotes enable row level security;

create index quotes_updated_at_idx on quotes(updated_at desc);

create policy "can_manage_quotes can read quotes" on quotes
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can insert quotes" on quotes
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can update quotes" on quotes
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_quotes'))
  with check (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can delete quotes" on quotes
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

-- ============================================================================
-- (2) quote_no generation
-- ============================================================================
create sequence quote_no_seq start 1;

grant usage, select on sequence quote_no_seq to authenticated;

create function public.generate_quote_no()
returns trigger
language plpgsql
as $$
begin
  new.quote_no := 'TSQ-' || lpad(nextval('quote_no_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger quotes_set_quote_no
  before insert on quotes
  for each row
  execute function public.generate_quote_no();
```

- [ ] **Step 4: Apply locally and regenerate types**

Run:
```bash
npx supabase migration up --local
npx supabase gen types typescript --local > types/database.ts
git diff --stat types/database.ts
```
Expected: migration applies without error; the diff adds a `quotes` table block and `can_manage_quotes` to `profiles` Row/Insert/Update. If the diff also rewrites unrelated parts of the file (formatting/header), compare with `git show HEAD:types/database.ts | head -5` — the file is generated output, so keep the regenerated version as long as only additive table/column changes appear.

- [ ] **Step 5: Run the RLS script to verify it passes**

Run: `npm run verify:quote-rls`
Expected: `PASS: 9/9 checks passed`.

- [ ] **Step 6: Wire the permission through the app**

`lib/auth/dal.ts` — extend the union:
```ts
export type Permission =
  | "can_manage_packages"
  | "can_message_customers"
  | "can_edit_crm"
  | "can_manage_vouchers"
  | "can_manage_quotes";
```

`components/admin/account-form-schema.ts` — add after `canManageVouchers: z.boolean(),`:
```ts
  canManageQuotes: z.boolean(),
```

`actions/users.ts` — add `canManageQuotes: boolean;` after `canManageVouchers: boolean;` in `AccountInput`, and in **both** `.update({ ... })` calls add after `can_manage_vouchers: values.canManageVouchers,`:
```ts
      can_manage_quotes: values.canManageQuotes,
```

`components/admin/account-form.tsx`:
- create form defaults: add `canManageQuotes: false,` after `canManageVouchers: false,`
- edit form defaults: add `canManageQuotes: account.can_manage_quotes,` after `canManageVouchers: account.can_manage_vouchers,`
- in **both** forms, directly after the `name="canManageVouchers"` `<FormField ... />` block and before `</FormSection>`, add:
```tsx
          <FormField
            control={form.control}
            name="canManageQuotes"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
                <FormLabel className="cursor-pointer">
                  Manage Quotes
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
```

`components/admin/users-table.tsx` — in **both** places, after the `{profile.can_manage_vouchers && ( <Badge variant="outline">Vouchers</Badge> )}` block add:
```tsx
                            {profile.can_manage_quotes && (
                              <Badge variant="outline">Quotes</Badge>
                            )}
```
(match the surrounding indentation of each location).

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (warnings that pre-exist on `staging` are acceptable; no new ones).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261004120000_create_quotes_schema.sql types/database.ts scripts/verify-quote-rls.ts package.json lib/auth/dal.ts components/admin/account-form-schema.ts components/admin/account-form.tsx actions/users.ts components/admin/users-table.tsx
git commit -m "feat: add quotes schema and can_manage_quotes permission"
```

---

### Task 2: Shared itinerary content schema and package→content mapper

**Files:**
- Create: `components/admin/itinerary-content-schema.ts`
- Create: `lib/packages/package-content.ts`
- Create: `scripts/verify-quote-values.ts`
- Modify: `components/admin/package-form-schema.ts` (whole file)
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx:76-152`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `itineraryContentSchema`, `type ItineraryContentValues = { pricePerPax: number; discountAmount?: number; durationLabel: string; remarks?: string; travelDates: { dateFrom: string; dateTo: string; additionalFee?: number }[]; itinerary: { title: string; description: string }[]; inclusions: { label: string }[]; exclusions: { label: string }[]; bringItems: { label: string }[] }`, `EMPTY_ITINERARY_CONTENT: ItineraryContentValues` — all from `components/admin/itinerary-content-schema.ts`.
- Produces: `packageFormSchema`, `PackageFormValues`, `EMPTY_DEFAULTS` (unchanged names/shapes) from `package-form-schema.ts`.
- Produces: `type PackageContentRow`, `packageRowToContentValues(pkg: PackageContentRow): ItineraryContentValues` from `lib/packages/package-content.ts`.

- [ ] **Step 1: Write the failing offline verify script**

Create `scripts/verify-quote-values.ts`:

```ts
/**
 * Offline proof for the pure quote/package value mappers
 * (lib/packages/package-content.ts, and -- added in later tasks --
 * lib/quotes/quote-row.ts). No Supabase, no network: every check runs the
 * mappers against hand-written fixtures. Mirrors
 * scripts/verify-poster-extraction.ts's record()/PASS-FAIL structure.
 *
 * Run via `npm run verify:quote-values`.
 */
import { itineraryContentSchema } from "../components/admin/itinerary-content-schema";
import {
  packageRowToContentValues,
  type PackageContentRow,
} from "../lib/packages/package-content";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
}

/** JSON with recursively sorted keys and undefined dropped -- order-insensitive equality. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

/** Every optional section populated, children deliberately out of order. */
export const FULL_PACKAGE: PackageContentRow = {
  price_per_pax: 5999,
  discount_amount: 1000,
  duration_label: "3 days, 2 nights",
  remarks: "Rates subject to change.",
  itinerary_days: [
    { day_number: 2, title: "Island Hopping", description: "Kayangan Lake\nTwin Lagoon" },
    { day_number: 1, title: "Arrival", description: "Airport pickup\nHotel check-in" },
  ],
  package_inclusions: [
    { kind: "excluded", label: "Airfare", sort_order: 0 },
    { kind: "included", label: "Hotel", sort_order: 1 },
    { kind: "included", label: "Breakfast", sort_order: 0 },
    { kind: "bring", label: "Sunscreen", sort_order: 0 },
  ],
  package_travel_dates: [
    { travel_date_from: "2026-12-20", travel_date_to: "2026-12-22", additional_fee: 500 },
    { travel_date_from: "2026-11-05", travel_date_to: "2026-11-07", additional_fee: null },
  ],
};

/** Every optional field empty -- the Review Focus #3 case. */
export const SPARSE_PACKAGE: PackageContentRow = {
  price_per_pax: 2500,
  discount_amount: null,
  duration_label: null,
  remarks: null,
  itinerary_days: [],
  package_inclusions: [],
  package_travel_dates: [
    { travel_date_from: "2026-11-05", travel_date_to: "2026-11-05", additional_fee: null },
  ],
};

function checkPackageContentOrdering(): void {
  const content = packageRowToContentValues(FULL_PACKAGE);
  const expected = {
    pricePerPax: 5999,
    discountAmount: 1000,
    durationLabel: "3 days, 2 nights",
    remarks: "Rates subject to change.",
    travelDates: [
      { dateFrom: "2026-11-05", dateTo: "2026-11-07" },
      { dateFrom: "2026-12-20", dateTo: "2026-12-22", additionalFee: 500 },
    ],
    itinerary: [
      { title: "Arrival", description: "Airport pickup\nHotel check-in" },
      { title: "Island Hopping", description: "Kayangan Lake\nTwin Lagoon" },
    ],
    inclusions: [{ label: "Breakfast" }, { label: "Hotel" }],
    exclusions: [{ label: "Airfare" }],
    bringItems: [{ label: "Sunscreen" }],
  };
  record(
    "packageRowToContentValues sorts days, inclusions and dates and splits by kind",
    canonical(content) === canonical(expected),
    canonical(content)
  );
}

function checkPackageContentSparse(): void {
  const content = packageRowToContentValues(SPARSE_PACKAGE);
  record(
    "packageRowToContentValues maps nulls to undefined/'' (never null)",
    content.discountAmount === undefined &&
      content.durationLabel === "" &&
      content.remarks === "" &&
      content.travelDates[0].additionalFee === undefined &&
      !JSON.stringify(content).includes("null"),
    canonical(content)
  );
}

function checkPackageContentValidates(): void {
  const parsed = itineraryContentSchema.safeParse(packageRowToContentValues(FULL_PACKAGE));
  record(
    "a fully populated package's content passes itineraryContentSchema",
    parsed.success,
    parsed.success ? "valid" : JSON.stringify(parsed.error.issues)
  );
}

function main(): void {
  checkPackageContentOrdering();
  checkPackageContentSparse();
  checkPackageContentValidates();

  console.log("\nverify-quote-values\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
  if (failed > 0) process.exit(1);
}

main();
```

Add to `package.json` scripts:
```json
"verify:quote-values": "tsx scripts/verify-quote-values.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run verify:quote-values`
Expected: FAIL with `Cannot find module '../components/admin/itinerary-content-schema'`.

- [ ] **Step 3: Create the shared content schema**

Create `components/admin/itinerary-content-schema.ts`:

```ts
import { z } from "zod";

/**
 * The itinerary content shared by packages and quotes -- everything the
 * "Download Full Itinerary" PDF prints except the title. Package- and
 * quote-specific fields (name/destination, title/customer) are added by
 * package-form-schema.ts and quote-form-schema.ts via .extend().
 *
 * No React dependency, so tsx scripts can import it directly.
 */

/**
 * Itinerary day: day_number is NOT a form field — it's computed from the
 * row's array index at submit time (actions/packages.ts) or render time
 * (lib/pdf/itinerary-pdf.tsx).
 */
export const itineraryDaySchema = z.object({
  title: z.string().min(1, "Please enter a day title"),
  description: z.string().min(1, "Please enter a day description"),
});

/**
 * Shared shape for inclusions/exclusions/bring-items rows — kind and
 * sort_order are computed at submit time (actions/packages.ts), not
 * user-entered.
 */
export const inclusionItemSchema = z.object({
  label: z.string().min(1, "Please enter a label"),
});

/**
 * dateFrom/dateTo are plain "YYYY-MM-DD" strings from native
 * <input type="date"> fields — no date library needed, and "YYYY-MM-DD"
 * strings compare correctly with plain >=/<=. additionalFee is the
 * optional surcharge for this whole date range (e.g. a peak-season
 * upcharge).
 */
export const travelDateSchema = z
  .object({
    dateFrom: z.string().min(1, "Please pick a start date"),
    dateTo: z.string().min(1, "Please pick an end date"),
    additionalFee: z
      .number({ error: "Fee must be a positive number" })
      .positive("Fee must be a positive number")
      .optional(),
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    message: "End date must be on or after the start date",
    path: ["dateTo"],
  });

export const itineraryContentSchema = z.object({
  pricePerPax: z
    .number({ error: "Price must be a positive number" })
    .int("Price must be a positive number")
    .positive("Price must be a positive number"),
  // Added ON TOP of pricePerPax to display an inflated, struck-through
  // "original" price (price 100 + discount 50 shows as ~~150~~ 100) --
  // pricePerPax itself is always the real price the customer pays, so there's
  // no upper bound tying discountAmount to it.
  discountAmount: z
    .number({ error: "Discount must be a positive number" })
    .positive("Discount must be a positive number")
    .optional(),
  durationLabel: z.string().min(1, "Please enter the duration"),
  remarks: z.string().optional(),
  travelDates: z
    .array(travelDateSchema)
    .min(1, "Add at least one travel date"),
  itinerary: z.array(itineraryDaySchema),
  inclusions: z.array(inclusionItemSchema),
  exclusions: z.array(inclusionItemSchema),
  bringItems: z.array(inclusionItemSchema),
});

export type ItineraryContentValues = z.infer<typeof itineraryContentSchema>;

export const EMPTY_ITINERARY_CONTENT: ItineraryContentValues = {
  pricePerPax: 0,
  discountAmount: undefined,
  durationLabel: "",
  remarks: "",
  travelDates: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
};
```

- [ ] **Step 4: Rebuild the package schema on top of it**

Replace the whole of `components/admin/package-form-schema.ts` with:

```ts
import { z } from "zod";

import {
  EMPTY_ITINERARY_CONTENT,
  itineraryContentSchema,
} from "./itinerary-content-schema";

export const packageFormSchema = itineraryContentSchema.extend({
  name: z.string().min(1, "Please enter a package name"),
  destinationId: z.string().min(1, "Please select a destination"),
});

export type PackageFormValues = z.infer<typeof packageFormSchema>;

/**
 * The form's reset baseline -- also PackageForm's default `useForm` values
 * and the shape poster imports get merged onto (`{ ...EMPTY_DEFAULTS,
 * ...values }`). Lives here rather than in package-form.tsx because this
 * module has no React dependency, so scripts/verify-poster-extraction.ts
 * (a plain tsx script, not a Next.js runtime) can import it directly instead
 * of hand-duplicating it -- importing package-form.tsx itself would pull in
 * actions/packages.ts -> lib/auth/dal.ts -> the `server-only` package,
 * which fails outside Next.js.
 */
export const EMPTY_DEFAULTS: PackageFormValues = {
  ...EMPTY_ITINERARY_CONTENT,
  name: "",
  destinationId: "",
};
```

- [ ] **Step 5: Write the package→content mapper**

Create `lib/packages/package-content.ts`:

```ts
import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import type { Tables } from "@/types/database";

/**
 * The minimal package shape that carries itinerary content -- satisfied by
 * the admin edit page's full row, fetchPackageForPdf()'s row, and
 * getPackageQuoteValues()'s narrow select alike.
 */
export type PackageContentRow = Pick<
  Tables<"packages">,
  "price_per_pax" | "discount_amount" | "duration_label" | "remarks"
> & {
  itinerary_days: Pick<Tables<"itinerary_days">, "day_number" | "title" | "description">[];
  package_inclusions: Pick<Tables<"package_inclusions">, "kind" | "label" | "sort_order">[];
  package_travel_dates: Pick<
    Tables<"package_travel_dates">,
    "travel_date_from" | "travel_date_to" | "additional_fee"
  >[];
};

function labelsOfKind(
  rows: PackageContentRow["package_inclusions"],
  kind: "included" | "excluded" | "bring"
): { label: string }[] {
  return rows
    .filter((item) => item.kind === kind)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));
}

/**
 * Package row + child rows -> the form/PDF content shape, in display order.
 * Nullable DB columns become undefined/"" (never null) so the result passes
 * itineraryContentSchema and merges cleanly onto EMPTY_ITINERARY_CONTENT.
 * Pure: no I/O.
 */
export function packageRowToContentValues(
  pkg: PackageContentRow
): ItineraryContentValues {
  return {
    pricePerPax: pkg.price_per_pax,
    discountAmount: pkg.discount_amount ?? undefined,
    durationLabel: pkg.duration_label ?? "",
    remarks: pkg.remarks ?? "",
    travelDates: [...pkg.package_travel_dates]
      .sort(
        (a, b) =>
          a.travel_date_from.localeCompare(b.travel_date_from) ||
          a.travel_date_to.localeCompare(b.travel_date_to)
      )
      .map((date) => ({
        dateFrom: date.travel_date_from,
        dateTo: date.travel_date_to,
        additionalFee: date.additional_fee ?? undefined,
      })),
    itinerary: [...pkg.itinerary_days]
      .sort((a, b) => a.day_number - b.day_number)
      .map((day) => ({ title: day.title, description: day.description })),
    inclusions: labelsOfKind(pkg.package_inclusions, "included"),
    exclusions: labelsOfKind(pkg.package_inclusions, "excluded"),
    bringItems: labelsOfKind(pkg.package_inclusions, "bring"),
  };
}
```

- [ ] **Step 6: Run the verify script to verify it passes**

Run: `npm run verify:quote-values && npm run verify:poster-extraction`
Expected: `3/3 checks passed.` then the poster-extraction suite still fully passes (it imports `packageFormSchema`/`EMPTY_DEFAULTS`, proving the schema refactor is behavior-neutral).

- [ ] **Step 7: Use the mapper in the package edit page**

In `app/admin/(dashboard)/packages/[id]/page.tsx`:
- add `import { packageRowToContentValues } from "@/lib/packages/package-content";`
- delete the `itinerary`, `inclusions`, `exclusions`, `bringItems` and `travelDates` constants (lines ~78–105)
- replace the `defaultValues` object with:
```ts
  const defaultValues: Partial<PackageFormValues> = {
    ...packageRowToContentValues(pkg),
    name: pkg.name,
    destinationId: pkg.destination_id ?? "",
  };
```
Leave `photos`, destination options, `isUnsavedDraft` and the JSX unchanged.

- [ ] **Step 8: Type-check, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add components/admin/itinerary-content-schema.ts components/admin/package-form-schema.ts lib/packages/package-content.ts scripts/verify-quote-values.ts package.json "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "refactor: share itinerary content schema and package content mapper"
```

---

### Task 3: Split the itinerary PDF template out of the package PDF

**Files:**
- Create: `lib/pdf/itinerary-pdf.tsx`
- Modify: `lib/pdf/package-pdf.tsx` (remove template, keep fetch + adapter)
- Modify: `scripts/verify-quote-values.ts` (add offline render check)

**Interfaces:**
- Consumes: `ItineraryContentValues` (Task 2), `packageRowToContentValues` (Task 2).
- Produces: `type ItineraryPdfData = { title: string; content: ItineraryContentValues }`, `ItineraryPdfDocument`, `renderItineraryPdf(data: ItineraryPdfData, logoSrc: string): Promise<Buffer>` from `lib/pdf/itinerary-pdf.tsx`.
- Produces (unchanged signatures): `fetchPackageForPdf`, `renderPackagePdf(pkg: PackagePdfData, logoSrc: string)`, `LOCAL_LOGO_PATH`, `PackagePdfData`; new `packageToPdfData(pkg: PackagePdfData): ItineraryPdfData` from `lib/pdf/package-pdf.tsx`.

- [ ] **Step 1: Capture a baseline PDF before touching anything**

Write a throwaway script into your scratch directory (NOT the repo), e.g. `$SCRATCH/pdf-baseline.ts`:

```ts
import { writeFileSync } from "node:fs";
import { renderPackagePdf, LOCAL_LOGO_PATH, type PackagePdfData } from "<repo>/lib/pdf/package-pdf";
import { FULL_PACKAGE } from "<repo>/scripts/verify-quote-values";

const pkg = { ...FULL_PACKAGE, name: "Coron Island Escape" } as unknown as PackagePdfData;
renderPackagePdf(pkg, LOCAL_LOGO_PATH).then((buf) => {
  writeFileSync(process.argv[2], buf);
  console.log("bytes", buf.length);
});
```
Replace `<repo>` with the absolute repo path. Importing `verify-quote-values.ts` runs its `main()` too — that's harmless (it prints its checks). Run from the repo root so tsx picks up `tsconfig.json` paths:
`npx tsx $SCRATCH/pdf-baseline.ts $SCRATCH/before.pdf`
Expected: prints `bytes <N>`; open `before.pdf` and keep it for Step 6.

- [ ] **Step 2: Write the failing offline render check**

In `scripts/verify-quote-values.ts` add imports:
```ts
import { renderItineraryPdf } from "../lib/pdf/itinerary-pdf";
import { LOCAL_LOGO_PATH } from "../lib/pdf/package-pdf";
```
add the check:
```ts
async function checkItineraryPdfRenders(): Promise<void> {
  const buffer = await renderItineraryPdf(
    { title: "Coron Island Escape", content: packageRowToContentValues(FULL_PACKAGE) },
    LOCAL_LOGO_PATH
  );
  const signature = buffer.subarray(0, 5).toString("ascii");
  record(
    "renderItineraryPdf produces a well-formed PDF offline",
    signature === "%PDF-" && buffer.length > 1000,
    `signature=${JSON.stringify(signature)} length=${buffer.length}`
  );
}
```
and make `main` async, awaiting it:
```ts
async function main(): Promise<void> {
  checkPackageContentOrdering();
  checkPackageContentSparse();
  checkPackageContentValidates();
  await checkItineraryPdfRenders();
  // ...existing printing/exit code unchanged...
}

main().catch((error) => {
  console.error("verify-quote-values failed:", error);
  process.exit(1);
});
```
(Remove the old bare `main();` call.)

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run verify:quote-values`
Expected: FAIL with `Cannot find module '../lib/pdf/itinerary-pdf'`.

- [ ] **Step 4: Create the shared template**

Create `lib/pdf/itinerary-pdf.tsx`. Its body is today's `PackagePdfDocument` with the package row replaced by `ItineraryPdfData`. Move `formatPhp`, `formatDate`, `formatTravelDateRange`, the three color constants, and the entire `styles` object **verbatim** from `lib/pdf/package-pdf.tsx` (copy them unchanged, including their comments), then:

```tsx
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { CONTACT_ADDRESS, CONTACT_EMAIL } from "@/lib/constants";
import { formatWhatsAppNumberForDisplay } from "@/lib/whatsapp";

/**
 * Source-neutral input for the "Download Full Itinerary" PDF. Packages
 * (lib/pdf/package-pdf.tsx) and quotes (lib/pdf/quote-pdf.ts) each adapt
 * onto this shape, so the two documents can never drift apart in layout.
 */
export type ItineraryPdfData = {
  title: string;
  content: ItineraryContentValues;
};

// formatPhp, formatDate, formatTravelDateRange, NAVY, ORANGE, RED, styles
// -- moved verbatim from lib/pdf/package-pdf.tsx.

export function ItineraryPdfDocument({
  data,
  logoSrc,
}: {
  data: ItineraryPdfData;
  logoSrc: string;
}) {
  const { title, content } = data;
  const finalPrice = content.pricePerPax;
  const hasDiscount = (content.discountAmount ?? 0) > 0;
  const strikePrice = content.pricePerPax + (content.discountAmount ?? 0);

  // Quotes store travel dates in entry order; sort here so both sources
  // print chronologically, exactly as the package PDF always has.
  const travelDates = [...content.travelDates].sort(
    (a, b) =>
      a.dateFrom.localeCompare(b.dateFrom) || a.dateTo.localeCompare(b.dateTo)
  );

  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={logoSrc} style={styles.logo} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.duration}>
            {content.durationLabel || "Duration TBA"}
          </Text>
          <View style={styles.priceRow}>
            {hasDiscount ? (
              <Text style={styles.priceStrike}>
                {formatPhp(strikePrice)}
              </Text>
            ) : null}
            <Text style={styles.price}>{formatPhp(finalPrice)} / pax</Text>
          </View>
        </View>

        {content.itinerary.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>ITINERARY</Text>
            {content.itinerary.map((day, dayIndex) => (
              <View key={dayIndex} style={styles.dayBlock} wrap={false}>
                <Text style={styles.dayTitle}>
                  Day {dayIndex + 1}: {day.title}
                </Text>
                {day.description
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, index) => (
                    <Text key={index} style={styles.bullet}>
                      • {line}
                    </Text>
                  ))}
              </View>
            ))}
          </View>
        ) : null}

        {content.inclusions.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>WHAT&apos;S INCLUDED</Text>
            {content.inclusions.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {content.exclusions.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>WHAT&apos;S NOT INCLUDED</Text>
            {content.exclusions.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {content.bringItems.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>WHAT TO BRING</Text>
            {content.bringItems.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {travelDates.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>TRAVEL DATES</Text>
            {travelDates.map((date, index) => (
              <View key={index} style={styles.dateRow}>
                <Text style={styles.paragraph}>
                  {formatTravelDateRange(date.dateFrom, date.dateTo)}
                </Text>
                {date.additionalFee ? (
                  <Text style={styles.dateFee}>
                    +{formatPhp(date.additionalFee)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {content.remarks ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>REMARKS</Text>
            <Text style={styles.paragraph}>{content.remarks}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <View style={styles.footerBar}>
            <Text>{formatWhatsAppNumberForDisplay()}</Text>
            <Text>{CONTACT_EMAIL}</Text>
            <Text>{CONTACT_ADDRESS}</Text>
          </View>
          <View style={styles.footerStripe} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderItineraryPdf(
  data: ItineraryPdfData,
  logoSrc: string
): Promise<Buffer> {
  return renderToBuffer(<ItineraryPdfDocument data={data} logoSrc={logoSrc} />);
}
```

Note: `content.durationLabel || "Duration TBA"` replaces `pkg.duration_label ?? "Duration TBA"` because the content mapper turns a null label into `""` — same output for every package.

- [ ] **Step 5: Reduce `lib/pdf/package-pdf.tsx` to fetch + adapter**

In `lib/pdf/package-pdf.tsx`:
- Remove the `@react-pdf/renderer` import, `CONTACT_*`/`formatWhatsAppNumberForDisplay` imports, `formatPhp`, `formatDate`, `formatTravelDateRange`, colors, `styles`, `PackagePdfDocument`, and the old `renderPackagePdf` body.
- Keep `path` import, `PackagePdfData`, `LOCAL_LOGO_PATH` (and its comment), and `fetchPackageForPdf` (and its comment) unchanged.
- Add:
```ts
import { packageRowToContentValues } from "@/lib/packages/package-content";
import { renderItineraryPdf, type ItineraryPdfData } from "@/lib/pdf/itinerary-pdf";

export function packageToPdfData(pkg: PackagePdfData): ItineraryPdfData {
  return { title: pkg.name, content: packageRowToContentValues(pkg) };
}

export async function renderPackagePdf(
  pkg: PackagePdfData,
  logoSrc: string
): Promise<Buffer> {
  return renderItineraryPdf(packageToPdfData(pkg), logoSrc);
}
```
The file no longer contains JSX; keep the `.tsx` extension anyway so no import path changes.

- [ ] **Step 6: Verify offline, compare with baseline, run the package PDF regressions**

Run: `npm run verify:quote-values`
Expected: `4/4 checks passed.`

Run: `npx tsx $SCRATCH/pdf-baseline.ts $SCRATCH/after.pdf`
Expected: byte count equal (or within a few bytes — the embedded creation timestamp is the only legitimately varying content) to Step 1's. Open `before.pdf` and `after.pdf` side by side: they must look identical.

Run (against the remote project in `.env.local`, which has packages — do NOT export local env vars in this shell, or run in a fresh shell): `npm run verify:package-pdf`
Expected: `PASS: 3/3 checks passed`. If `npm run dev` is running, also `npm run verify:admin-package-pdf` and `npm run verify:public-package-pdf` must pass unchanged (read each script's header for its prerequisites).

- [ ] **Step 7: Type-check, lint, commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add lib/pdf/itinerary-pdf.tsx lib/pdf/package-pdf.tsx scripts/verify-quote-values.ts
git commit -m "refactor: extract shared itinerary PDF template"
```

---

### Task 4: Quote form schema, quote row mapping, quote PDF route

**Files:**
- Create: `components/admin/quote-form-schema.ts`
- Create: `lib/quotes/quote-row.ts`
- Create: `lib/pdf/quote-pdf.ts`
- Create: `app/admin/(dashboard)/quotes/[id]/pdf/route.ts`
- Create: `scripts/verify-quote-pdf.ts`
- Modify: `scripts/verify-quote-values.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `itineraryContentSchema`, `EMPTY_ITINERARY_CONTENT`, `ItineraryContentValues` (Task 2); `ItineraryPdfData`, `renderItineraryPdf` (Task 3); `Tables<"quotes">`, `TablesInsert<"quotes">` (Task 1).
- Produces: `quoteFormSchema`, `type QuoteFormValues = ItineraryContentValues & { title: string; customerName?: string; contactId?: string }`, `EMPTY_QUOTE_VALUES` from `components/admin/quote-form-schema.ts`.
- Produces: `type QuoteSource = "manual" | "flyer" | "package"`, `type QuoteRowPatch`, `quoteValuesToRow(values: QuoteFormValues): QuoteRowPatch`, `type QuoteContentRow`, `quoteRowToFormValues(row: QuoteContentRow): QuoteFormValues` (throws `ZodError` on malformed jsonb), `toItineraryContent(values: QuoteFormValues): ItineraryContentValues` from `lib/quotes/quote-row.ts`.
- Produces: `fetchQuoteForPdf(supabase, id: string): Promise<Tables<"quotes"> | null>`, `quoteToPdfData(quote: Tables<"quotes">): ItineraryPdfData` from `lib/pdf/quote-pdf.ts`.
- Produces: `GET /admin/quotes/[id]/pdf` → `application/pdf`, `attachment; filename="<quote_no>.pdf"`.

- [ ] **Step 1: Write the failing offline checks**

In `scripts/verify-quote-values.ts` add imports:
```ts
import type { QuoteFormValues } from "../components/admin/quote-form-schema";
import { quoteFormSchema } from "../components/admin/quote-form-schema";
import {
  quoteRowToFormValues,
  quoteValuesToRow,
  type QuoteContentRow,
} from "../lib/quotes/quote-row";
```
add the helper and checks:
```ts
/** What PostgREST hands back: the inserted patch after a JSON round trip. */
function simulateStoredRow(values: QuoteFormValues): QuoteContentRow {
  return JSON.parse(JSON.stringify(quoteValuesToRow(values))) as QuoteContentRow;
}

function checkQuoteRoundTrip(): void {
  const values: QuoteFormValues = {
    ...packageRowToContentValues(FULL_PACKAGE),
    title: "Coron for the Santos family",
    customerName: "Maria Santos",
    contactId: "",
  };
  const back = quoteRowToFormValues(simulateStoredRow(values));
  record(
    "quote values survive quoteValuesToRow -> JSON -> quoteRowToFormValues",
    canonical(back) === canonical(values) && quoteFormSchema.safeParse(back).success,
    canonical(back)
  );
}

function checkPackageToQuoteMatches(): void {
  for (const [label, fixture] of [["full", FULL_PACKAGE], ["sparse", SPARSE_PACKAGE]] as const) {
    const packageContent = packageRowToContentValues(fixture);
    const quote = quoteRowToFormValues(
      simulateStoredRow({ ...packageContent, title: "x", customerName: "", contactId: "" })
    );
    const { title: _t, customerName: _c, contactId: _id, ...quoteContent } = quote;
    void _t; void _c; void _id;
    record(
      `a quote copied from a ${label} package carries identical itinerary content`,
      canonical(quoteContent) === canonical(packageContent),
      canonical(quoteContent)
    );
  }
}

function checkEmptyOptionalsBecomeNull(): void {
  const row = quoteValuesToRow({
    ...packageRowToContentValues(SPARSE_PACKAGE),
    title: "  Trimmed  ",
    customerName: "   ",
    contactId: "",
    remarks: "",
  });
  record(
    "quoteValuesToRow stores blank optionals as null and trims text",
    row.title === "Trimmed" &&
      row.customer_name === null &&
      row.contact_id === null &&
      row.remarks === null &&
      row.discount_amount === null,
    JSON.stringify(row)
  );
}

function checkCorruptJsonbThrows(): void {
  const row = simulateStoredRow({
    ...packageRowToContentValues(FULL_PACKAGE),
    title: "x",
    customerName: "",
    contactId: "",
  });
  let threw = false;
  try {
    quoteRowToFormValues({ ...row, itinerary: [{ title: 42 }] });
  } catch {
    threw = true;
  }
  record(
    "quoteRowToFormValues throws on malformed stored jsonb (never renders half a quote)",
    threw,
    threw ? "threw" : "returned without error"
  );
}
```
and call them from `main()` before `await checkItineraryPdfRenders();`:
```ts
  checkQuoteRoundTrip();
  checkPackageToQuoteMatches();
  checkEmptyOptionalsBecomeNull();
  checkCorruptJsonbThrows();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run verify:quote-values`
Expected: FAIL with `Cannot find module '../components/admin/quote-form-schema'`.

- [ ] **Step 3: Create the quote form schema**

Create `components/admin/quote-form-schema.ts`:

```ts
import { z } from "zod";

import {
  EMPTY_ITINERARY_CONTENT,
  itineraryContentSchema,
} from "./itinerary-content-schema";

// customerName/contactId are plain optional strings, not .nullable() --
// same convention as voucher-form-schema.ts: "" means unset in the form,
// converted to null at the lib/quotes/quote-row.ts boundary.
export const quoteFormSchema = itineraryContentSchema.extend({
  title: z.string().trim().min(1, "Please enter a quote title"),
  customerName: z.string().optional(),
  contactId: z.string().optional(),
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;

export const EMPTY_QUOTE_VALUES: QuoteFormValues = {
  ...EMPTY_ITINERARY_CONTENT,
  title: "",
  customerName: "",
  contactId: "",
};
```

- [ ] **Step 4: Create the quote row mapper**

Create `lib/quotes/quote-row.ts`:

```ts
import {
  inclusionItemSchema,
  itineraryDaySchema,
  travelDateSchema,
  type ItineraryContentValues,
} from "@/components/admin/itinerary-content-schema";
import type { QuoteFormValues } from "@/components/admin/quote-form-schema";
import type { Tables, TablesInsert } from "@/types/database";
import { z } from "zod";

export type QuoteSource = "manual" | "flyer" | "package";

/** Columns the quote form owns -- everything except id/quote_no/source/audit. */
export type QuoteRowPatch = Pick<
  TablesInsert<"quotes">,
  | "title"
  | "customer_name"
  | "contact_id"
  | "price_per_pax"
  | "discount_amount"
  | "duration_label"
  | "remarks"
  | "travel_dates"
  | "itinerary"
  | "inclusions"
  | "exclusions"
  | "bring_items"
>;

export type QuoteContentRow = Pick<
  Tables<"quotes">,
  | "title"
  | "customer_name"
  | "contact_id"
  | "price_per_pax"
  | "discount_amount"
  | "duration_label"
  | "remarks"
  | "travel_dates"
  | "itinerary"
  | "inclusions"
  | "exclusions"
  | "bring_items"
>;

/**
 * Re-validates jsonb on the way OUT of the database. Deliberately the same
 * item schemas the form writes with: a row that no longer matches (hand
 * edit, future schema change) must fail loudly rather than render a quote
 * PDF with silently missing sections.
 */
const storedContentSchema = z.object({
  travelDates: z.array(travelDateSchema),
  itinerary: z.array(itineraryDaySchema),
  inclusions: z.array(inclusionItemSchema),
  exclusions: z.array(inclusionItemSchema),
  bringItems: z.array(inclusionItemSchema),
});

export function quoteValuesToRow(values: QuoteFormValues): QuoteRowPatch {
  return {
    title: values.title.trim(),
    customer_name: values.customerName?.trim() || null,
    contact_id: values.contactId || null,
    price_per_pax: values.pricePerPax,
    discount_amount: values.discountAmount ?? null,
    duration_label: values.durationLabel,
    remarks: values.remarks?.trim() || null,
    travel_dates: values.travelDates,
    itinerary: values.itinerary,
    inclusions: values.inclusions,
    exclusions: values.exclusions,
    bring_items: values.bringItems,
  };
}

/** Throws ZodError if the stored jsonb doesn't match the content schema. */
export function quoteRowToFormValues(row: QuoteContentRow): QuoteFormValues {
  const stored = storedContentSchema.parse({
    travelDates: row.travel_dates,
    itinerary: row.itinerary,
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    bringItems: row.bring_items,
  });

  return {
    title: row.title,
    customerName: row.customer_name ?? "",
    contactId: row.contact_id ?? "",
    pricePerPax: row.price_per_pax,
    discountAmount: row.discount_amount ?? undefined,
    durationLabel: row.duration_label,
    remarks: row.remarks ?? "",
    ...stored,
  };
}

/** The PDF-relevant subset of a quote's form values. */
export function toItineraryContent(values: QuoteFormValues): ItineraryContentValues {
  return {
    pricePerPax: values.pricePerPax,
    discountAmount: values.discountAmount,
    durationLabel: values.durationLabel,
    remarks: values.remarks,
    travelDates: values.travelDates,
    itinerary: values.itinerary,
    inclusions: values.inclusions,
    exclusions: values.exclusions,
    bringItems: values.bringItems,
  };
}
```

If `npx tsc` reports the jsonb assignments (`travel_dates: values.travelDates` etc.) are not assignable to `Json`, change each to `values.travelDates as Json` and import `type Json` from `@/types/database` — do not loosen anything else.

- [ ] **Step 5: Run the offline checks to verify they pass**

Run: `npm run verify:quote-values`
Expected: `9/9 checks passed.` (3 package-content checks + 5 quote-row checks — `checkPackageToQuoteMatches` records 2 — + 1 PDF render.)

- [ ] **Step 6: Write the failing live quote-PDF check**

Create `scripts/verify-quote-pdf.ts`:

```ts
/**
 * Live-data verification for the quote PDF (lib/pdf/quote-pdf.ts). Inserts
 * a disposable quote through the same quoteValuesToRow() the server actions
 * use, fetches it via fetchQuoteForPdf(), renders via quoteToPdfData() ->
 * renderItineraryPdf(), and asserts a real PDF buffer. Always deletes the
 * disposable quote in a finally block. Mirrors scripts/verify-package-pdf.ts.
 *
 * Run via `npm run verify:quote-pdf` against a project with the quotes
 * migration applied (see the plan's Local Environment Notes).
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { EMPTY_QUOTE_VALUES } from "../components/admin/quote-form-schema";
import { quoteValuesToRow } from "../lib/quotes/quote-row";
import { fetchQuoteForPdf, quoteToPdfData } from "../lib/pdf/quote-pdf";
import { renderItineraryPdf } from "../lib/pdf/itinerary-pdf";
import { LOCAL_LOGO_PATH } from "../lib/pdf/package-pdf";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY. Run via `npm run verify:quote-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const supabase = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const results: CheckResult[] = [];
  let quoteId: string | undefined;

  try {
    const { data: inserted, error: insertError } = await supabase
      .from("quotes")
      .insert(
        quoteValuesToRow({
          ...EMPTY_QUOTE_VALUES,
          title: "Verify quote PDF",
          pricePerPax: 4999,
          discountAmount: 500,
          durationLabel: "2 days, 1 night",
          remarks: "Disposable verification quote.",
          travelDates: [{ dateFrom: "2026-12-01", dateTo: "2026-12-02", additionalFee: 300 }],
          itinerary: [{ title: "Arrival", description: "Pickup\nCheck-in" }],
          inclusions: [{ label: "Hotel" }],
          exclusions: [{ label: "Airfare" }],
          bringItems: [{ label: "ID" }],
        })
      )
      .select("id, quote_no")
      .single();
    if (insertError || !inserted) throw new Error(`insert failed: ${insertError?.message}`);
    quoteId = inserted.id;

    const quote = await fetchQuoteForPdf(supabase, inserted.id);
    results.push({
      name: "fetchQuoteForPdf returns the quote",
      pass: quote !== null && quote.id === inserted.id,
      detail: quote ? `fetched ${quote.quote_no}` : "returned null",
    });
    if (!quote) throw new Error("Cannot continue -- fetchQuoteForPdf returned null");

    const data = quoteToPdfData(quote);
    results.push({
      name: "quoteToPdfData carries title and every content section",
      pass:
        data.title === "Verify quote PDF" &&
        data.content.itinerary.length === 1 &&
        data.content.inclusions.length === 1 &&
        data.content.exclusions.length === 1 &&
        data.content.bringItems.length === 1 &&
        data.content.travelDates[0].additionalFee === 300,
      detail: JSON.stringify(data.content),
    });

    const buffer = await renderItineraryPdf(data, LOCAL_LOGO_PATH);
    const signature = buffer.subarray(0, 5).toString("ascii");
    results.push({
      name: "quote renders to a well-formed PDF buffer",
      pass: signature === "%PDF-" && buffer.length > 1000,
      detail: `signature=${JSON.stringify(signature)} length=${buffer.length}`,
    });
  } finally {
    if (quoteId) {
      const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
      if (error) console.error(`WARNING: failed to delete disposable quote ${quoteId}: ${error.message}`);
    }
  }

  console.log("\nverify-quote-pdf\n");
  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-quote-pdf failed:", err);
  process.exit(1);
});
```

Add to `package.json` scripts:
```json
"verify:quote-pdf": "tsx --env-file=.env.local scripts/verify-quote-pdf.ts",
```

Run (local-stack env exported): `npm run verify:quote-pdf`
Expected: FAIL with `Cannot find module '../lib/pdf/quote-pdf'`.

- [ ] **Step 7: Create the quote PDF adapter**

Create `lib/pdf/quote-pdf.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItineraryPdfData } from "@/lib/pdf/itinerary-pdf";
import { quoteRowToFormValues, toItineraryContent } from "@/lib/quotes/quote-row";
import type { Database, Tables } from "@/types/database";

/**
 * Fetches one quote by id through the caller's client -- RLS
 * (can_manage_quotes) decides visibility, so an unauthorized caller simply
 * gets null.
 */
export async function fetchQuoteForPdf(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<Tables<"quotes"> | null> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("fetchQuoteForPdf failed:", error);
    return null;
  }
  return data;
}

/**
 * Quote row -> the shared itinerary PDF input. Throws (via
 * quoteRowToFormValues) if the stored jsonb is malformed; the route turns
 * that into a logged 500.
 */
export function quoteToPdfData(quote: Tables<"quotes">): ItineraryPdfData {
  const values = quoteRowToFormValues(quote);
  return { title: values.title, content: toItineraryContent(values) };
}
```

- [ ] **Step 8: Create the PDF route**

Create `app/admin/(dashboard)/quotes/[id]/pdf/route.ts`:

```ts
import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { renderItineraryPdf } from "@/lib/pdf/itinerary-pdf";
import { fetchQuoteForPdf, quoteToPdfData } from "@/lib/pdf/quote-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin PDF download for a quote -- same shape as
 * app/admin/(dashboard)/packages/[id]/pdf/route.ts, rendered through the
 * same ItineraryPdfDocument, so a quote prints exactly like a package's
 * "Download Full Itinerary". The filename carries the quote number; the
 * document itself does not (spec: nothing quote-specific is printed).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const quote = await fetchQuoteForPdf(supabase, id);
  if (!quote) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();

  let buffer: Buffer;
  try {
    buffer = await renderItineraryPdf(quoteToPdfData(quote), logoSrc);
  } catch (err) {
    console.error(`Quote PDF failed for ${quote.quote_no}:`, err);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  // Same Buffer -> Uint8Array wrap as the package PDF route (BodyInit typing).
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${quote.quote_no}.pdf"`,
    },
  });
}
```

- [ ] **Step 9: Run both verify scripts to verify they pass**

Run: `npm run verify:quote-values && npm run verify:quote-pdf`
Expected: `9/9 checks passed.` then `PASS: 3/3 checks passed`.

- [ ] **Step 10: Type-check, lint, commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add components/admin/quote-form-schema.ts lib/quotes/quote-row.ts lib/pdf/quote-pdf.ts "app/admin/(dashboard)/quotes/[id]/pdf/route.ts" scripts/verify-quote-values.ts scripts/verify-quote-pdf.ts package.json
git commit -m "feat: add quote row mapping and quote PDF route"
```

---

### Task 5: Shared form sections and form-import hook (PackageForm refactor)

This task changes no behavior. It moves code out of `components/admin/package-form.tsx` so `QuoteForm` (Task 8) can reuse it.

**Files:**
- Create: `components/admin/itinerary-fields/remove-confirmation.tsx`
- Create: `components/admin/itinerary-fields/pricing-fields.tsx`
- Create: `components/admin/itinerary-fields/travel-dates-fields.tsx`
- Create: `components/admin/itinerary-fields/itinerary-days-fields.tsx`
- Create: `components/admin/itinerary-fields/label-lists-fields.tsx`
- Create: `components/admin/use-form-import.tsx`
- Modify: `components/admin/poster-import-context.tsx`
- Modify: `lib/packages/poster-mapping.ts:9-14` (`UnmappedField.field` type)
- Modify: `components/admin/package-form.tsx` (most of the file)

**Interfaces:**
- Consumes: `ItineraryContentValues` (Task 2).
- Produces: `type RequestRemove = (hasContent: boolean, label: string, onConfirm: () => void) => void`; `useRemoveConfirmation(noun: string): { requestRemove: RequestRemove; dialog: React.ReactNode }`.
- Produces: `<PricingFields />`, `<TravelDatesFields onRequestRemove />`, `<ItineraryDaysFields onRequestRemove />`, `<LabelListsFields onRequestRemove />` — each reads the form via `useFormContext<ItineraryContentValues>()`, so they must render inside `<Form {...form}>`.
- Produces: `type FormImport = { values: Record<string, unknown>; unmapped: UnmappedField[]; origin?: { source: "flyer" } | { source: "package"; packageId: string } }`; `PosterImportProvider`, `usePosterImport(): { extraction: FormImport | null; importSeq: number; isDismissed: boolean; applyExtraction(result: FormImport): void; dismiss(): void }`.
- Produces: `useFormImport<V extends FieldValues>({ form, emptyValues, noun, onApplied }): { dialog: React.ReactNode }` where `onApplied: (applied: FormImport) => void`.

- [ ] **Step 1: Generalize the import context**

In `lib/packages/poster-mapping.ts`, change `UnmappedField.field` to a plain string (the banner only uses it as a React key; the quote mapper emits `"title"`):
```ts
export type UnmappedField = {
  field: string;
  label: string;
  tab: string;
  reason: string;
};
```
(`flag()`'s own `field: keyof PackageFormValues` parameter stays, so the package mapper is still type-checked.)

Replace `components/admin/poster-import-context.tsx` with:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { UnmappedField } from "@/lib/packages/poster-mapping";

/**
 * One import into a form: a flyer extraction (package or quote) or a
 * package copied into a quote. `values` is loosely typed because the same
 * provider serves both PackageForm and QuoteForm; useFormImport() narrows
 * it to the consuming form's values type. `origin` lets QuoteForm record
 * where a quote came from; PackageForm ignores it.
 */
export type FormImport = {
  values: Record<string, unknown>;
  unmapped: UnmappedField[];
  origin?: { source: "flyer" } | { source: "package"; packageId: string };
};

type PosterImportContextValue = {
  extraction: FormImport | null;
  /**
   * Increments on every successful import. useFormImport keys its reset
   * effect on this rather than on the extraction object, so importing a
   * second poster with identical results still re-fills the form.
   */
  importSeq: number;
  isDismissed: boolean;
  applyExtraction: (result: FormImport) => void;
  dismiss: () => void;
};

const PosterImportContext = createContext<PosterImportContextValue | null>(null);

/**
 * Bridges the import controls (rendered in the page header) and the form
 * (rendered below it) -- they sit on opposite branches of the page tree, so
 * a shared parent holds the one piece of state between them.
 */
export function PosterImportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    result: FormImport;
    seq: number;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const applyExtraction = useCallback((result: FormImport) => {
    setState((previous) => ({ result, seq: (previous?.seq ?? 0) + 1 }));
    setIsDismissed(false);
  }, []);

  const dismiss = useCallback(() => setIsDismissed(true), []);

  const value = useMemo<PosterImportContextValue>(
    () => ({
      extraction: state?.result ?? null,
      importSeq: state?.seq ?? 0,
      isDismissed,
      applyExtraction,
      dismiss,
    }),
    [state, isDismissed, applyExtraction, dismiss]
  );

  return (
    <PosterImportContext value={value}>{children}</PosterImportContext>
  );
}

export function usePosterImport(): PosterImportContextValue {
  const context = useContext(PosterImportContext);
  if (context === null) {
    throw new Error("usePosterImport must be used within a PosterImportProvider");
  }
  return context;
}
```

- [ ] **Step 2: Create the remove-confirmation hook**

Create `components/admin/itinerary-fields/remove-confirmation.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type RequestRemove = (
  hasContent: boolean,
  label: string,
  onConfirm: () => void
) => void;

/**
 * Removing a row that has content asks first; an empty row goes straight
 * away. `noun` finishes the sentence "can't be undone once you save the
 * <noun>". Render `dialog` once inside the form.
 */
export function useRemoveConfirmation(noun: string): {
  requestRemove: RequestRemove;
  dialog: React.ReactNode;
} {
  const [pendingRemoval, setPendingRemoval] = useState<{
    label: string;
    onConfirm: () => void;
  } | null>(null);

  const requestRemove = useCallback<RequestRemove>(
    (hasContent, label, onConfirm) => {
      if (hasContent) {
        setPendingRemoval({ label, onConfirm });
      } else {
        onConfirm();
      }
    },
    []
  );

  const dialog = (
    <AlertDialog
      open={pendingRemoval !== null}
      onOpenChange={(open) => !open && setPendingRemoval(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {pendingRemoval?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete its content. This can&apos;t be undone once
            you save the {noun}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              pendingRemoval?.onConfirm();
              setPendingRemoval(null);
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestRemove, dialog };
}
```

- [ ] **Step 3: Create the pricing fields section**

Create `components/admin/itinerary-fields/pricing-fields.tsx` — the price/discount/duration/remarks fields moved verbatim from PackageForm's Details tab (lines 309–393), with `control` coming from context:

```tsx
"use client";

import { useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

/** Price per pax, discount, duration and remarks -- shared by packages and quotes. */
export function PricingFields() {
  const form = useFormContext<ItineraryContentValues>();

  return (
    <>
      <FormField
        control={form.control}
        name="pricePerPax"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price per pax (PHP)</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="number"
                min={1}
                prefix="₱"
                onChange={(event) =>
                  field.onChange(event.target.valueAsNumber)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="discountAmount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Discount (PHP, optional)</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ""}
                type="number"
                min={1}
                prefix="₱"
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? undefined
                      : event.target.valueAsNumber
                  )
                }
              />
            </FormControl>
            <FormDescription>
              Added on top of the price per pax to show a struck-through
              &quot;was&quot; price (e.g. ₱100 price + ₱50 discount
              shows as ₱150 crossed out, ₱100 charged).
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="durationLabel"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Duration</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="text"
                placeholder="3 days, 2 nights"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="remarks"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Remarks (optional)</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
```

- [ ] **Step 4: Create the travel dates section**

Create `components/admin/itinerary-fields/travel-dates-fields.tsx` — PackageForm lines 401–505 moved verbatim, with `useFieldArray` owned here and `requestRemove` passed in:

```tsx
"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { RequestRemove } from "./remove-confirmation";

export function TravelDatesFields({
  onRequestRemove,
}: {
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<ItineraryContentValues>();
  const travelDatesArray = useFieldArray({
    control: form.control,
    name: "travelDates",
  });

  return (
    <>
      {travelDatesArray.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-[16px] leading-[1.2] font-semibold">
              Date {index + 1}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                onRequestRemove(
                  Boolean(
                    form.getValues(`travelDates.${index}.dateFrom`) ||
                      form.getValues(`travelDates.${index}.dateTo`) ||
                      form.getValues(`travelDates.${index}.additionalFee`)
                  ),
                  `Date ${index + 1}`,
                  () => travelDatesArray.remove(index)
                )
              }
            >
              Remove date
            </Button>
          </div>
          <FormField
            control={form.control}
            name={`travelDates.${index}.dateFrom`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>From</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`travelDates.${index}.dateTo`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>To</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`travelDates.${index}.additionalFee`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additional fee (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={1}
                    prefix="₱"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? undefined
                          : event.target.valueAsNumber
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  e.g. a peak-season surcharge for this date.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() =>
          travelDatesArray.append({
            dateFrom: "",
            dateTo: "",
            additionalFee: undefined,
          })
        }
      >
        Add travel date
      </Button>
      {form.formState.errors.travelDates?.message ? (
        <p className="text-sm text-destructive">
          {form.formState.errors.travelDates.message}
        </p>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Create the itinerary days section**

Create `components/admin/itinerary-fields/itinerary-days-fields.tsx` — PackageForm lines 513–578 moved verbatim:

```tsx
"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { RequestRemove } from "./remove-confirmation";

export function ItineraryDaysFields({
  onRequestRemove,
}: {
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<ItineraryContentValues>();
  const itineraryArray = useFieldArray({
    control: form.control,
    name: "itinerary",
  });

  return (
    <>
      {itineraryArray.fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-[16px] leading-[1.2] font-semibold">
              Day {index + 1}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                onRequestRemove(
                  Boolean(
                    form.getValues(`itinerary.${index}.title`) ||
                      form.getValues(`itinerary.${index}.description`)
                  ),
                  `Day ${index + 1}`,
                  () => itineraryArray.remove(index)
                )
              }
            >
              Remove day
            </Button>
          </div>
          <FormField
            control={form.control}
            name={`itinerary.${index}.title`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} type="text" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`itinerary.${index}.description`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => itineraryArray.append({ title: "", description: "" })}
      >
        Add day
      </Button>
    </>
  );
}
```

- [ ] **Step 6: Create the label-lists section**

Create `components/admin/itinerary-fields/label-lists-fields.tsx` — the three identical Included/Excluded/What to Bring blocks (PackageForm lines 594–736) collapsed into one component rendered three times, with identical markup and copy:

```tsx
"use client";

import { useFieldArray, useFormContext } from "react-hook-form";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { RequestRemove } from "./remove-confirmation";

type LabelListName = "inclusions" | "exclusions" | "bringItems";

function LabelList({
  name,
  heading,
  itemLabel,
  addLabel,
  onRequestRemove,
}: {
  name: LabelListName;
  heading: string;
  itemLabel: string;
  addLabel: string;
  onRequestRemove: RequestRemove;
}) {
  const form = useFormContext<ItineraryContentValues>();
  const listArray = useFieldArray({ control: form.control, name });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
        {heading}
      </h3>
      {listArray.fields.map((field, index) => (
        <div key={field.id} className="flex items-end gap-2">
          <span className="pt-2 self-start text-sm text-muted-foreground">
            {index + 1}.
          </span>
          <FormField
            control={form.control}
            name={`${name}.${index}.label`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input {...field} type="text" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() =>
              onRequestRemove(
                Boolean(form.getValues(`${name}.${index}.label`)),
                `${itemLabel} ${index + 1}`,
                () => listArray.remove(index)
              )
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => listArray.append({ label: "" })}
      >
        {addLabel}
      </Button>
    </div>
  );
}

/** Included / Excluded / What to Bring -- the Inclusions tab body. */
export function LabelListsFields({
  onRequestRemove,
}: {
  onRequestRemove: RequestRemove;
}) {
  return (
    <>
      <LabelList
        name="inclusions"
        heading="Included"
        itemLabel="Included item"
        addLabel="Add included item"
        onRequestRemove={onRequestRemove}
      />
      <LabelList
        name="exclusions"
        heading="Excluded"
        itemLabel="Excluded item"
        addLabel="Add excluded item"
        onRequestRemove={onRequestRemove}
      />
      <LabelList
        name="bringItems"
        heading="What to Bring"
        itemLabel="Item to bring"
        addLabel="Add item to bring"
        onRequestRemove={onRequestRemove}
      />
    </>
  );
}
```

- [ ] **Step 7: Create the form-import hook**

Create `components/admin/use-form-import.tsx` — PackageForm lines 145–197 and its replace dialog (lines 768–795) moved here, generic over the form's values:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePosterImport, type FormImport } from "./poster-import-context";

/**
 * Applies imports from PosterImportProvider (a flyer extraction, or a
 * package copied into a quote) to `form`. An import replaces the whole
 * form: on an untouched form it applies straight away; if the admin has
 * already typed something, it asks first. Render `dialog` inside the form.
 * `onApplied` runs once the import actually lands (e.g. switch to the
 * Details tab, record the quote's source).
 */
export function useFormImport<V extends FieldValues>({
  form,
  emptyValues,
  noun,
  onApplied,
}: {
  form: UseFormReturn<V>;
  emptyValues: V;
  noun: string;
  onApplied: (applied: FormImport) => void;
}): { dialog: React.ReactNode } {
  const { extraction, importSeq } = usePosterImport();
  const [pendingImport, setPendingImport] = useState<{
    values: V;
    source: FormImport;
  } | null>(null);
  // Tracks which importSeq has already been handled -- dialog opened, or
  // immediate-apply tab switch performed -- so the derived render logic
  // below doesn't refire (and reopen a just-cancelled dialog, or re-force
  // the Details tab) on unrelated re-renders once importSeq itself stops
  // changing.
  const [handledImportSeq, setHandledImportSeq] = useState(0);

  const merge = (source: FormImport): V =>
    ({ ...emptyValues, ...(source.values as Partial<V>) }) as V;

  /**
   * Keyed on importSeq, not on `extraction`, so re-importing a poster that
   * yields identical values still re-fills the form.
   *
   * Both branches below are decided directly in the render body -- React's
   * documented "adjusting state when a value changes" alternative to an
   * Effect (https://react.dev/learn/you-might-not-need-an-effect). Neither
   * "should the confirmation dialog be open" nor "which tab is active" is
   * an imperative call to an external system; both are pure UI state
   * derivable from importSeq and the form's own isDirty flag. form.reset()
   * is different -- it mutates react-hook-form's internal store and
   * notifies subscribers -- so it alone stays in the effect below.
   */
  // Read unconditionally (not just inside the branch below) so react-hook-form
  // subscribes to isDirty at mount. RHF only computes isDirty once something
  // has read it through the formState proxy -- if the first read happened
  // inside the `importSeq !== 0` branch, the very first import would run
  // before the subscription existed and form.formState.isDirty would still
  // read stale/false, silently skipping the confirmation dialog.
  const isFormDirty = form.formState.isDirty;

  if (importSeq !== 0 && importSeq !== handledImportSeq && extraction !== null) {
    setHandledImportSeq(importSeq);
    if (isFormDirty) {
      setPendingImport({ values: merge(extraction), source: extraction });
    } else {
      onApplied(extraction);
    }
  }

  useEffect(() => {
    if (importSeq === 0 || extraction === null) return;
    if (isFormDirty) return; // handled above, during render

    form.reset(merge(extraction));
    // form and extraction are stable for a given importSeq; re-running on
    // their identity would re-apply the import on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importSeq]);

  const dialog = (
    <AlertDialog
      open={pendingImport !== null}
      onOpenChange={(open) => !open && setPendingImport(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace what you&apos;ve entered?</AlertDialogTitle>
          <AlertDialogDescription>
            Importing this {noun} will overwrite everything currently in
            this form, including any changes you&apos;ve typed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingImport) {
                form.reset(pendingImport.values);
                onApplied(pendingImport.source);
              }
              setPendingImport(null);
            }}
          >
            Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog };
}
```

- [ ] **Step 8: Rewire PackageForm onto the shared pieces**

Edit `components/admin/package-form.tsx`:

1. Imports: change line 3 to `import { useMemo, useState } from "react";` and line 4 to `import { useForm, type FieldErrors } from "react-hook-form";`. Remove the `usePosterImport` import, the `Textarea` import, the `FormDescription` import, and the whole `AlertDialog*` import block. Add:
```tsx
import { useFormImport } from "./use-form-import";
import { useRemoveConfirmation } from "./itinerary-fields/remove-confirmation";
import { PricingFields } from "./itinerary-fields/pricing-fields";
import { TravelDatesFields } from "./itinerary-fields/travel-dates-fields";
import { ItineraryDaysFields } from "./itinerary-fields/itinerary-days-fields";
import { LabelListsFields } from "./itinerary-fields/label-lists-fields";
```
2. Delete the five `useFieldArray` calls (lines 119–138), the `pendingRemoval` state (140–143), everything from `const { extraction, importSeq } = usePosterImport();` through the end of the `useEffect` (145–197), and the `requestRemove` function (199–209). In their place, after `const form = useForm<...>(...)`, add:
```tsx
  const { requestRemove, dialog: removeDialog } =
    useRemoveConfirmation("package");
  const { dialog: importDialog } = useFormImport({
    form,
    emptyValues: EMPTY_DEFAULTS,
    noun: "poster",
    onApplied: () => setActiveTab("details"),
  });
```
3. Details tab: replace the four `FormField`s for `pricePerPax`, `discountAmount`, `durationLabel`, `remarks` (lines 309–393) with `<PricingFields />`. Keep the `name` and `destinationId` fields above it unchanged.
4. Travel Dates tab: replace the tab's children (lines 401–505) with `<TravelDatesFields onRequestRemove={requestRemove} />`.
5. Itinerary tab: replace the tab's children (lines 513–578) with `<ItineraryDaysFields onRequestRemove={requestRemove} />`.
6. Inclusions tab: replace the tab's children (lines 594–736) with `<LabelListsFields onRequestRemove={requestRemove} />`.
7. Replace both `<AlertDialog ...>` blocks (lines 741–795) with:
```tsx
        {removeDialog}
        {importDialog}
```
Leave `TAB_FIELD_MAP`, `onSubmit`, `onInvalid`, the Photos tab, and `FormActionBar` unchanged.

- [ ] **Step 9: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. `grep -c "useFieldArray" components/admin/package-form.tsx` prints `0`.

- [ ] **Step 10: Manual regression of the package form**

Run `npm run dev` (against `.env.local`'s project), sign in as an admin, and on `/admin/packages`:
1. Click **Add Package** → **Import from Poster** with any poster image → form fills, Details tab active, banner lists missing items. (Requires `ANTHROPIC_API_KEY`; if absent, confirm the "isn't configured yet" toast and skip to 3.)
2. Type in the name field, import again → "Replace what you've entered?" appears; Cancel keeps your text; repeat and Replace overwrites.
3. Add a travel date, type a date, click **Remove date** → "Remove Date 1?" dialog with "…once you save the package."; empty row removes without asking. Same for a day and an included item.
4. Submit with no travel dates → jumps to Travel Dates tab, shows "Add at least one travel date".
5. Fill everything and **Save Changes** → "Package saved."; reload shows the saved values in order; **Download Full Itinerary** downloads the PDF unchanged.
Delete the test package afterward.

- [ ] **Step 11: Commit**

```bash
git add components/admin/itinerary-fields components/admin/use-form-import.tsx components/admin/poster-import-context.tsx components/admin/package-form.tsx lib/packages/poster-mapping.ts
git commit -m "refactor: extract shared itinerary form sections and import hook"
```

---

### Task 6: Shared poster extraction core, quote flyer mapping, generic import button

**Files:**
- Create: `lib/packages/extract-poster.ts`
- Create: `lib/quotes/poster-mapping.ts`
- Create: `actions/quote-poster.ts`
- Modify: `actions/package-poster.ts` (whole file)
- Modify: `lib/packages/poster-prompt.ts` (one sentence)
- Modify: `components/admin/poster-import-button.tsx`
- Modify: `scripts/verify-poster-extraction.ts`

**Interfaces:**
- Consumes: `PosterExtraction`, `buildPosterSystemPrompt` (existing); `mapPosterToFormValues`, `UnmappedField` (existing); `QuoteFormValues`, `quoteFormSchema`, `EMPTY_QUOTE_VALUES` (Task 4); `FormImport` (Task 5).
- Produces: `extractPosterData(input: { base64: string; mimeType: string; destinationNames: string[] }): Promise<{ ok: true; data: PosterExtraction } | { ok: false; error: string }>` and `POSTER_GENERIC_ERROR_MESSAGE` from `lib/packages/extract-poster.ts`.
- Produces: `mapPosterToQuoteValues(raw: PosterExtraction): { values: Partial<QuoteFormValues>; unmapped: UnmappedField[] }` from `lib/quotes/poster-mapping.ts`.
- Produces: server action `extractQuoteFromPoster(input: { base64: string; mimeType: string }): Promise<ActionResult & { values?: Partial<QuoteFormValues>; unmapped?: UnmappedField[] }>`.
- Produces: `<PosterImportButton extract? noun? label? />` — defaults keep today's package behavior.

- [ ] **Step 1: Write the failing quote-mapping checks**

In `scripts/verify-poster-extraction.ts` add imports:
```ts
import {
  quoteFormSchema,
  EMPTY_QUOTE_VALUES,
} from "../components/admin/quote-form-schema";
import { mapPosterToQuoteValues } from "../lib/quotes/poster-mapping";
```
add before `main()`:
```ts
// --- Quote mapping (flyer -> quote form) ---------------------------------
function checkQuoteMapping(): void {
  const full = poster({
    name: "Coron Island Escape",
    destinationName: "Coron, Palawan",
    pricePerPax: 5999,
    originalPricePerPax: 6999,
    durationLabel: "3D2N",
    travelDates: [{ dateFrom: "2026-11-05", dateTo: "2026-11-07", additionalFee: null }],
    itinerary: [{ title: "Arrival", description: "Pickup" }],
    inclusions: ["Hotel"],
    exclusions: ["Airfare"],
    bringItems: ["Sunscreen"],
  });
  const { values, unmapped } = mapPosterToQuoteValues(full);

  record(
    "quote mapping: poster name becomes the quote title",
    values.title === "Coron Island Escape" && !("name" in values),
    JSON.stringify(values)
  );
  record(
    "quote mapping: destination is neither filled nor flagged",
    !("destinationId" in values) && !flaggedFields(unmapped).includes("destinationId"),
    JSON.stringify(flaggedFields(unmapped))
  );
  const discount = unmapped.find((entry) => entry.field === "discountAmount");
  record(
    "quote mapping: discount reason talks about the quote PDF, not the site",
    discount !== undefined && discount.reason.includes("on the quote PDF") && !discount.reason.includes("on the site"),
    discount?.reason ?? "no discount entry"
  );
  record(
    "quote mapping: merged onto EMPTY_QUOTE_VALUES, the result passes quoteFormSchema",
    quoteFormSchema.safeParse({ ...EMPTY_QUOTE_VALUES, ...values }).success,
    JSON.stringify(values)
  );

  const empty = mapPosterToQuoteValues(emptyPoster());
  record(
    "quote mapping: no undefined-valued keys (they would blank EMPTY_QUOTE_VALUES on spread)",
    Object.values(empty.values).every((value) => value !== undefined),
    JSON.stringify(Object.keys(empty.values))
  );
  const titleFlag = empty.unmapped.find((entry) => entry.field === "title");
  record(
    "quote mapping: a missing title is flagged as the quote title",
    titleFlag !== undefined && titleFlag.label === "Quote title" && !flaggedFields(empty.unmapped).includes("name"),
    JSON.stringify(empty.unmapped.map((e) => `${e.field}:${e.label}`))
  );
}
```
and call `checkQuoteMapping();` in `main()` after `checkErrorMessages();`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run verify:poster-extraction`
Expected: FAIL with `Cannot find module '../lib/quotes/poster-mapping'`.

- [ ] **Step 3: Write the quote flyer mapper**

Create `lib/quotes/poster-mapping.ts`:

```ts
import type { QuoteFormValues } from "@/components/admin/quote-form-schema";
import {
  mapPosterToFormValues,
  type UnmappedField,
} from "@/lib/packages/poster-mapping";
import type { PosterExtraction } from "@/lib/packages/poster-prompt";

/**
 * Flyer -> quote form values. Reuses the package mapper for every rule
 * (pricing, dates, partial drops, never-auto-fill-discount) and only
 * translates its output: name -> title, destination dropped (quotes have
 * none), and the discount hint re-pointed from the public site to the PDF.
 * Pure: no I/O.
 */
export function mapPosterToQuoteValues(raw: PosterExtraction): {
  values: Partial<QuoteFormValues>;
  unmapped: UnmappedField[];
} {
  const mapped = mapPosterToFormValues(raw, []);
  const v = mapped.values;

  const values: Partial<QuoteFormValues> = {
    title: v.name,
    pricePerPax: v.pricePerPax,
    discountAmount: v.discountAmount,
    durationLabel: v.durationLabel,
    remarks: v.remarks,
    travelDates: v.travelDates,
    itinerary: v.itinerary,
    inclusions: v.inclusions,
    exclusions: v.exclusions,
    bringItems: v.bringItems,
  };
  // Drop the keys the flyer didn't fill: the form merges with
  // `{ ...EMPTY_QUOTE_VALUES, ...values }`, and an explicit undefined would
  // overwrite a default (travelDates: undefined crashes useFieldArray).
  for (const key of Object.keys(values) as (keyof QuoteFormValues)[]) {
    if (values[key] === undefined) delete values[key];
  }

  const unmapped = mapped.unmapped
    .filter((entry) => entry.field !== "destinationId")
    .map((entry): UnmappedField => {
      if (entry.field === "name") {
        return {
          ...entry,
          field: "title",
          label: "Quote title",
          reason: "The flyer doesn't show a tour title. Type one on the Details tab.",
        };
      }
      if (entry.field === "discountAmount") {
        return {
          ...entry,
          reason: entry.reason.replace("on the site", "on the quote PDF"),
        };
      }
      return entry;
    });

  return { values, unmapped };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run verify:poster-extraction`
Expected: every check PASS, including the six new quote-mapping checks.

- [ ] **Step 5: Extract the Claude call into a shared server-only module**

Create `lib/packages/extract-poster.ts`. Its body is today's `extractPackageFromPoster` minus the permission check, destination loading and mapping — move the validation, API-key check, client construction, `messages.parse` call (with its comments), `parsed_output` check and `catch` **verbatim**:

```ts
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  PosterExtractionSchema,
  buildPosterSystemPrompt,
  type PosterExtraction,
} from "@/lib/packages/poster-prompt";
import { describePosterExtractionError } from "@/lib/packages/poster-error";
import {
  MAX_API_IMAGE_BYTES,
  isAcceptedMimeType,
  POSTER_PREP_FAILED_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";

export const POSTER_GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

export type ExtractPosterResult =
  | { ok: true; data: PosterExtraction }
  | { ok: false; error: string };

/**
 * Validates a poster/flyer image and transcribes it with Claude. Shared by
 * extractPackageFromPoster (actions/package-poster.ts) and
 * extractQuoteFromPoster (actions/quote-poster.ts); callers own the
 * permission check and the mapping onto their form.
 *
 * The Anthropic client is constructed per call rather than at module scope
 * (same reasoning as lib/storage/r2-client.ts): a missing ANTHROPIC_API_KEY
 * then surfaces as a handled request-time error instead of breaking the
 * build for every page that transitively imports this module.
 */
export async function extractPosterData(input: {
  base64: string;
  mimeType: string;
  destinationNames: string[];
}): Promise<ExtractPosterResult> {
  const mimeType = input.mimeType;
  if (!isAcceptedMimeType(mimeType)) {
    return { ok: false, error: UNSUPPORTED_POSTER_MESSAGE };
  }

  // ...decodedBytes computation, empty-file check and MAX_API_IMAGE_BYTES
  // check, moved verbatim from actions/package-poster.ts...

  // ...ANTHROPIC_API_KEY check, moved verbatim...

  try {
    // ...`new Anthropic({ timeout: 60_000, maxRetries: 1 })` and the
    // `client.messages.parse({...})` call moved verbatim, EXCEPT:
    //   system: buildPosterSystemPrompt(input.destinationNames),
    // ...

    if (!response.parsed_output) {
      // ...log + "Couldn't read this poster..." return, moved verbatim...
    }

    return { ok: true, data: response.parsed_output };
  } catch (error) {
    // Branch selection and copy live in describePosterExtractionError so
    // every case is verifiable offline (scripts/verify-poster-extraction.ts).
    const { message, log } = describePosterExtractionError(error);
    console.error(log);
    return { ok: false, error: message };
  }
}
```

The `// ...moved verbatim...` markers mean: paste the exact statements from the current `actions/package-poster.ts` at those points (lines 59–79 for the byte checks, 97–107 for the key check, 109–161 for the client/parse/null-output block). Nothing in them changes except `system:` reading `input.destinationNames`, and `input.base64` stays `input.base64`.

- [ ] **Step 6: Slim the package action onto it**

Replace `actions/package-poster.ts` with:

```ts
"use server";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import {
  extractPosterData,
  POSTER_GENERIC_ERROR_MESSAGE,
} from "@/lib/packages/extract-poster";
import {
  mapPosterToFormValues,
  type UnmappedField,
} from "@/lib/packages/poster-mapping";

// Only async functions may be exported from a "use server" module. A type
// alias is erased at compile time, so this one is fine.
export type PosterExtractionResult = ActionResult & {
  values?: Partial<PackageFormValues>;
  unmapped?: UnmappedField[];
};

/**
 * Reads a marketing poster image and returns package form values plus the
 * fields the poster didn't supply. Writes nothing -- the caller fills the
 * in-memory form and the admin still saves through updatePackage.
 */
export async function extractPackageFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<PosterExtractionResult> {
  // AUTH-05 — same gate as every other package write path.
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data: destinationRows, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
    return { ok: false, error: POSTER_GENERIC_ERROR_MESSAGE };
  }

  const destinations = destinationRows ?? [];

  const extracted = await extractPosterData({
    ...input,
    destinationNames: destinations.map((d) => d.name),
  });
  if (!extracted.ok) return extracted;

  const { values, unmapped } = mapPosterToFormValues(extracted.data, destinations);
  return { ok: true, values, unmapped };
}
```

(Behavior note: destinations now load before the file-type/size checks instead of after. An invalid file still gets the same error message; it just costs one extra lightweight query.)

- [ ] **Step 7: Add the quote flyer action**

Create `actions/quote-poster.ts`:

```ts
"use server";

import { requirePermission } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/action-result";
import type { QuoteFormValues } from "@/components/admin/quote-form-schema";
import { extractPosterData } from "@/lib/packages/extract-poster";
import type { UnmappedField } from "@/lib/packages/poster-mapping";
import { mapPosterToQuoteValues } from "@/lib/quotes/poster-mapping";

export type QuotePosterResult = ActionResult & {
  values?: Partial<QuoteFormValues>;
  unmapped?: UnmappedField[];
};

/**
 * Reads a flyer image into quote form values. Writes nothing -- the admin
 * reviews the in-memory form and saves through createQuote. Quotes have no
 * destination, so no destination list is sent to the model.
 */
export async function extractQuoteFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<QuotePosterResult> {
  await requirePermission("can_manage_quotes");

  const extracted = await extractPosterData({ ...input, destinationNames: [] });
  if (!extracted.ok) return extracted;

  const { values, unmapped } = mapPosterToQuoteValues(extracted.data);
  return { ok: true, values, unmapped };
}
```

- [ ] **Step 8: Neutralize the one package-specific prompt sentence**

In `lib/packages/poster-prompt.ts`, inside `buildPosterSystemPrompt`, change:
```
A guess is harmful -- these values are published to a public website customers book against.
```
to:
```
A guess is harmful -- these values are shown to customers who book against them.
```
Change nothing else in the prompt.

- [ ] **Step 9: Generalize the import button**

In `components/admin/poster-import-button.tsx`:
1. Add imports:
```tsx
import type { ActionResult } from "@/lib/action-result";
import type { UnmappedField } from "@/lib/packages/poster-mapping";
```
2. Above the component, add:
```tsx
type ExtractAction = (input: {
  base64: string;
  mimeType: string;
}) => Promise<
  ActionResult & { values?: Record<string, unknown>; unmapped?: UnmappedField[] }
>;
```
3. Change the signature and doc comment to:
```tsx
/**
 * Uploads a poster/flyer, hands the extraction to PosterImportProvider, and
 * reports the outcome -- it never writes to the database itself. Defaults
 * are the package page's; the quote page passes extractQuoteFromPoster and
 * "flyer" wording.
 */
export function PosterImportButton({
  extract = extractPackageFromPoster,
  noun = "poster",
  label = "Import from Poster",
}: {
  extract?: ExtractAction;
  noun?: string;
  label?: string;
}) {
```
4. Replace `extractPackageFromPoster({` with `extract({`.
5. Replace the user-facing copy:
   - `title: "Still reading the poster",` → ``title: `Still reading the ${noun}`,``
   - in `description`, `"This poster hasn't finished processing..."` → ``description: `This ${noun} hasn't finished processing. If you leave now the import is cancelled, and none of its details will be filled into the form.`,``
   - `"Nothing could be read from that poster. Try a clearer image, or fill the form in manually."` → `` `Nothing could be read from that ${noun}. Try a clearer image, or fill the form in manually.` ``
   - both `from the poster` in the success toasts → `` from the ${noun} `` (keep them template literals)
   - `"Reading poster..."` → `` `Reading ${noun}...` ``; `"Import from Poster"` → `{label}`
6. In the `applyExtraction({...})` call add `origin: { source: "flyer" },`.

- [ ] **Step 10: Type-check, lint, re-run verify, commit**

Run: `npx tsc --noEmit && npm run lint && npm run verify:poster-extraction`
Expected: clean; all checks PASS.

Optional (one paid API call): `npm run verify:poster-extraction:live -- <path-to-a-poster-image>` — expected: prints a raw extraction and mapped values.

Manual: repeat Task 5 Step 10 item 1 (package poster import) — identical behavior and copy.

```bash
git add lib/packages/extract-poster.ts lib/quotes/poster-mapping.ts actions/quote-poster.ts actions/package-poster.ts lib/packages/poster-prompt.ts components/admin/poster-import-button.tsx scripts/verify-poster-extraction.ts
git commit -m "refactor: share poster extraction core and add quote flyer mapping"
```

---

### Task 7: Quote server actions

**Files:**
- Create: `actions/quotes.ts`

**Interfaces:**
- Consumes: `quoteFormSchema`, `QuoteFormValues` (Task 4); `quoteValuesToRow`, `QuoteSource` (Task 4); `packageRowToContentValues` (Task 2).
- Produces:
  - `createQuote(values: QuoteFormValues, origin: { source: QuoteSource; sourcePackageId: string | null }): Promise<ActionResult & { id?: string }>`
  - `updateQuote(id: string, values: QuoteFormValues): Promise<ActionResult>`
  - `deleteQuote(id: string): Promise<ActionResult>`
  - `getPackageQuoteValues(packageId: string): Promise<ActionResult & { values?: Partial<QuoteFormValues> }>`

- [ ] **Step 1: Write the actions**

Create `actions/quotes.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  quoteFormSchema,
  type QuoteFormValues,
} from "@/components/admin/quote-form-schema";
import { quoteValuesToRow, type QuoteSource } from "@/lib/quotes/quote-row";
import { packageRowToContentValues } from "@/lib/packages/package-content";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const INVALID_MESSAGE =
  "Some fields are invalid. Please review the form and try again.";

/**
 * Inserts a new quote. quote_no and created_by are assigned by the
 * database (trigger / auth.uid() default), never sent from here.
 */
export async function createQuote(
  values: QuoteFormValues,
  origin: { source: QuoteSource; sourcePackageId: string | null }
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_quotes");

  const parsed = quoteFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      ...quoteValuesToRow(parsed.data),
      source: origin.source,
      source_package_id:
        origin.source === "package" ? origin.sourcePackageId : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createQuote failed:", error?.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/quotes");
  return { ok: true, id: data.id };
}

/** Overwrites a quote's form-owned columns; source/quote_no never change. */
export async function updateQuote(
  id: string,
  values: QuoteFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const parsed = quoteFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({
      ...quoteValuesToRow(parsed.data),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("updateQuote failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That quote no longer exists." };
  }

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${id}`);
  return { ok: true };
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);

  if (error) {
    console.error("deleteQuote failed:", error.message);
    return { ok: false, error: "Something went wrong deleting that quote. Please try again." };
  }

  revalidatePath("/admin/quotes");
  return { ok: true };
}

/**
 * A published package's content as quote form values, for "Copy from a
 * package". Reads through the caller's client: published packages and their
 * child rows are publicly readable, so this works for staff who have
 * can_manage_quotes but not can_manage_packages.
 */
export async function getPackageQuoteValues(
  packageId: string
): Promise<ActionResult & { values?: Partial<QuoteFormValues> }> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .select(
      `name, price_per_pax, discount_amount, duration_label, remarks,
      itinerary_days(day_number, title, description),
      package_inclusions(kind, label, sort_order),
      package_travel_dates(travel_date_from, travel_date_to, additional_fee)`
    )
    .eq("id", packageId)
    .eq("is_published", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("getPackageQuoteValues failed:", error.message);
    return { ok: false, error: "Couldn't load that package. Please try again." };
  }
  if (!data) {
    return { ok: false, error: "That package isn't available anymore." };
  }

  return {
    ok: true,
    values: { title: data.name, ...packageRowToContentValues(data) },
  };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (These actions need the Next.js runtime, so they are exercised end-to-end in Task 8 Step 6; their DB rules are already pinned by `verify:quote-rls`, and their mapping by `verify:quote-values`.)

- [ ] **Step 3: Commit**

```bash
git add actions/quotes.ts
git commit -m "feat: add quote server actions"
```

---

### Task 8: Quotes UI — form, pages, picker, list, sidebar

**Files:**
- Create: `components/admin/quote-form.tsx`
- Create: `components/admin/quote-package-picker.tsx`
- Create: `components/admin/quote-table.tsx`
- Create: `app/admin/(dashboard)/quotes/page.tsx`
- Create: `app/admin/(dashboard)/quotes/loading.tsx`
- Create: `app/admin/(dashboard)/quotes/new/page.tsx`
- Create: `app/admin/(dashboard)/quotes/[id]/page.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Modify: `app/admin/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: everything above — `quoteFormSchema`, `EMPTY_QUOTE_VALUES`, `QuoteFormValues`, `QuoteSource`, `quoteRowToFormValues` (Task 4); `PricingFields`, `TravelDatesFields`, `ItineraryDaysFields`, `LabelListsFields`, `useRemoveConfirmation`, `useFormImport`, `PosterImportProvider`, `usePosterImport` (Task 5); `PosterImportButton`, `PosterImportBanner`, `extractQuoteFromPoster` (Task 6); `createQuote`, `updateQuote`, `deleteQuote`, `getPackageQuoteValues` (Task 7).
- Produces: routes `/admin/quotes`, `/admin/quotes/new`, `/admin/quotes/[id]`; sidebar item "Quotes".

- [ ] **Step 1: Create the quote form**

Create `components/admin/quote-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createQuote, updateQuote } from "@/actions/quotes";
import {
  EMPTY_QUOTE_VALUES,
  quoteFormSchema,
  type QuoteFormValues,
} from "./quote-form-schema";
import type { QuoteSource } from "@/lib/quotes/quote-row";
import { useFormImport } from "./use-form-import";
import { useRemoveConfirmation } from "./itinerary-fields/remove-confirmation";
import { PricingFields } from "./itinerary-fields/pricing-fields";
import { TravelDatesFields } from "./itinerary-fields/travel-dates-fields";
import { ItineraryDaysFields } from "./itinerary-fields/itinerary-days-fields";
import { LabelListsFields } from "./itinerary-fields/label-lists-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { FormActionBar } from "@/components/admin/form-action-bar";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type QuoteContactOption = { id: string; name: string; email: string };

/** Same first-errored-tab search as PackageForm's TAB_FIELD_MAP. */
const TAB_FIELD_MAP: Array<{ tab: string; fields: Array<keyof QuoteFormValues> }> = [
  {
    tab: "details",
    fields: [
      "title",
      "customerName",
      "contactId",
      "pricePerPax",
      "discountAmount",
      "durationLabel",
      "remarks",
    ],
  },
  { tab: "travel-dates", fields: ["travelDates"] },
  { tab: "itinerary", fields: ["itinerary"] },
  { tab: "inclusions", fields: ["inclusions", "exclusions", "bringItems"] },
];

/**
 * Create (no quoteId) or edit a quote. In create mode the form lives only in
 * memory until the first save, then redirects to the quote's own page;
 * imports (flyer / copy from package) arrive through PosterImportProvider
 * exactly like PackageForm's poster import, and set the quote's source.
 */
export function QuoteForm({
  quoteId,
  defaultValues,
  contacts,
}: {
  quoteId?: string;
  defaultValues?: QuoteFormValues;
  contacts: QuoteContactOption[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [origin, setOrigin] = useState<{
    source: QuoteSource;
    sourcePackageId: string | null;
  }>({ source: "manual", sourcePackageId: null });

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: defaultValues ?? EMPTY_QUOTE_VALUES,
  });

  const { requestRemove, dialog: removeDialog } = useRemoveConfirmation("quote");
  const { dialog: importDialog } = useFormImport({
    form,
    emptyValues: EMPTY_QUOTE_VALUES,
    noun: "content",
    onApplied: (applied) => {
      setActiveTab("details");
      if (applied.origin?.source === "package") {
        setOrigin({ source: "package", sourcePackageId: applied.origin.packageId });
      } else if (applied.origin?.source === "flyer") {
        setOrigin({ source: "flyer", sourcePackageId: null });
      }
    },
  });

  const selectedContact =
    contacts.find((c) => c.id === form.watch("contactId")) ?? null;

  async function onSubmit(values: QuoteFormValues) {
    setIsSubmitting(true);
    try {
      if (quoteId) {
        const result = await updateQuote(quoteId, values);
        if (result.ok) {
          toast.success("Quote saved.");
          form.reset(values);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createQuote(values, origin);
        if (result.ok && result.id) {
          toast.success("Quote created.");
          router.push(`/admin/quotes/${result.id}`);
        } else if (!result.ok) {
          toast.error(result.error);
        }
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function onInvalid(errors: FieldErrors<QuoteFormValues>) {
    const erroredTab = TAB_FIELD_MAP.find(({ fields }) =>
      fields.some((field) => field in errors)
    );
    if (erroredTab) setActiveTab(erroredTab.tab);
    toast.error("Please fix the highlighted fields before submitting.");
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-6"
        noValidate
      >
        <Card className="gap-4 p-5 sm:p-8">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as string)}
          >
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="travel-dates">Travel Dates</TabsTrigger>
              <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
              <TabsTrigger value="inclusions">Inclusions</TabsTrigger>
            </TabsList>

            <TabsContent value="details" keepMounted className="flex flex-col gap-4 pt-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" placeholder="Coron Island Escape" />
                    </FormControl>
                    <FormDescription>Printed as the heading of the PDF.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer name (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="text" />
                    </FormControl>
                    <FormDescription>
                      For your reference only — not printed on the PDF.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CRM contact (optional)</FormLabel>
                    <FormControl>
                      <Combobox
                        items={contacts}
                        value={selectedContact}
                        onValueChange={(contact) => {
                          field.onChange(contact?.id ?? "");
                          if (contact && !form.getValues("customerName")) {
                            form.setValue("customerName", contact.name, {
                              shouldDirty: true,
                            });
                          }
                        }}
                        itemToStringLabel={(contact: QuoteContactOption) =>
                          `${contact.name} (${contact.email})`
                        }
                      >
                        <ComboboxInputGroup>
                          <ComboboxInput placeholder="Not linked..." />
                          {selectedContact ? <ComboboxClear /> : <ComboboxTrigger />}
                        </ComboboxInputGroup>
                        <ComboboxPortal>
                          <ComboboxPositioner>
                            <ComboboxPopup>
                              <ComboboxEmpty>No contacts found.</ComboboxEmpty>
                              <ComboboxList>
                                {(contact: QuoteContactOption) => (
                                  <ComboboxItem key={contact.id} value={contact}>
                                    {contact.name} ({contact.email})
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxPopup>
                          </ComboboxPositioner>
                        </ComboboxPortal>
                      </Combobox>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PricingFields />
            </TabsContent>

            <TabsContent value="travel-dates" keepMounted className="flex flex-col gap-4 pt-4">
              <TravelDatesFields onRequestRemove={requestRemove} />
            </TabsContent>

            <TabsContent value="itinerary" keepMounted className="flex flex-col gap-4 pt-4">
              <ItineraryDaysFields onRequestRemove={requestRemove} />
            </TabsContent>

            <TabsContent value="inclusions" keepMounted className="flex flex-col gap-6 pt-4">
              <LabelListsFields onRequestRemove={requestRemove} />
            </TabsContent>
          </Tabs>
        </Card>

        {removeDialog}
        {importDialog}

        <FormActionBar>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : quoteId ? "Save Changes" : "Create Quote"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Create the copy-from-package picker**

Create `components/admin/quote-package-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

import { getPackageQuoteValues } from "@/actions/quotes";
import { usePosterImport } from "./poster-import-context";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";

export type QuotePackageOption = { id: string; name: string; slug: string };

/**
 * "Copy from a package": loads a published package's content and hands it
 * to QuoteForm through the same import channel as a flyer, so the
 * replace-what-you've-typed confirmation applies identically. The quote
 * gets a frozen copy -- later package edits never reach it.
 */
export function QuotePackagePicker({
  packages,
}: {
  packages: QuotePackageOption[];
}) {
  const { applyExtraction } = usePosterImport();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSelect(pkg: QuotePackageOption | null) {
    if (!pkg) return;
    setIsLoading(true);
    try {
      const result = await getPackageQuoteValues(pkg.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      applyExtraction({
        values: result.values ?? {},
        unmapped: [],
        origin: { source: "package", packageId: pkg.id },
      });
      toast.success(`Loaded "${pkg.name}".`);
    } catch {
      toast.error("Couldn't load that package. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-72">
      <Combobox
        items={packages}
        value={null}
        onValueChange={handleSelect}
        disabled={isLoading}
        itemToStringLabel={(pkg: QuotePackageOption) => `${pkg.name} (${pkg.slug})`}
      >
        <ComboboxInputGroup>
          <ComboboxInput
            placeholder={isLoading ? "Loading package..." : "Copy from a package..."}
          />
          <ComboboxTrigger />
        </ComboboxInputGroup>
        <ComboboxPortal>
          <ComboboxPositioner>
            <ComboboxPopup>
              <ComboboxEmpty>No published packages found.</ComboboxEmpty>
              <ComboboxList>
                {(pkg: QuotePackageOption) => (
                  <ComboboxItem key={pkg.id} value={pkg}>
                    {pkg.name} ({pkg.slug})
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </ComboboxPositioner>
        </ComboboxPortal>
      </Combobox>
    </div>
  );
}
```

If `npx tsc` rejects `disabled` on `Combobox`, check `node_modules/@base-ui/react/combobox` root props for the disabled prop name; if none exists, drop `disabled` and rely on the placeholder text (the action is idempotent).

- [ ] **Step 3: Create the quotes table**

Create `components/admin/quote-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

import { deleteQuote } from "@/actions/quotes";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type QuoteListItem = {
  id: string;
  quoteNo: string;
  title: string;
  customerLabel: string | null;
  updatedAt: string;
};

export function QuoteTable({ quotes }: { quotes: QuoteListItem[] }) {
  const [pendingDelete, setPendingDelete] = useState<QuoteListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteQuote(pendingDelete.id);
      if (result.ok) toast.success(`${pendingDelete.quoteNo} deleted.`);
      else toast.error(result.error);
    } catch {
      toast.error("Something went wrong deleting that quote. Please try again.");
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  if (quotes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No quotes yet. Create one with <span className="font-medium">New Quote</span>.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quote no.</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((quote) => (
            <TableRow key={quote.id}>
              <TableCell className="font-mono">{quote.quoteNo}</TableCell>
              <TableCell>
                <Link href={`/admin/quotes/${quote.id}`} className="font-medium hover:underline">
                  {quote.title}
                </Link>
              </TableCell>
              <TableCell>{quote.customerLabel ?? "—"}</TableCell>
              <TableCell>{format(new Date(quote.updatedAt), "MMM d, yyyy")}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<a href={`/admin/quotes/${quote.id}/pdf`} download />}
                  >
                    Download PDF
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setPendingDelete(quote)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.quoteNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.title}&quot; will be permanently deleted.
              PDFs already downloaded are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

(`date-fns` is in the project stack; if `npm ls date-fns` shows it missing, format with `new Date(quote.updatedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })` instead of adding a dependency.)

- [ ] **Step 4: Create the pages**

`app/admin/(dashboard)/quotes/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function QuotesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
```

`app/admin/(dashboard)/quotes/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { QuoteTable, type QuoteListItem } from "@/components/admin/quote-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Quotes | TravelSentro Admin",
};

export default async function AdminQuotesPage() {
  // AUTH-05 — gate independent of nav hiding; RLS is the second layer.
  await requirePermissionOrRedirect("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_no, title, customer_name, updated_at, contacts(name)")
    .order("updated_at", { ascending: false });

  if (error) console.error("Failed to load quotes:", error.message);

  const quotes: QuoteListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    quoteNo: row.quote_no,
    title: row.title,
    customerLabel: row.customer_name ?? row.contacts?.name ?? null,
    updatedAt: row.updated_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quotes"
        description="Build a customer quote by hand, from a flyer, or by copying a package, then download it as a PDF."
      >
        <Button size="lg" render={<Link href="/admin/quotes/new" />}>
          New Quote
        </Button>
      </PageHeader>

      <QuoteTable quotes={quotes} />
    </div>
  );
}
```

`app/admin/(dashboard)/quotes/new/page.tsx`:
```tsx
import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { extractQuoteFromPoster } from "@/actions/quote-poster";
import { PageHeader } from "@/components/admin/page-header";
import { PosterImportProvider } from "@/components/admin/poster-import-context";
import { PosterImportButton } from "@/components/admin/poster-import-button";
import { PosterImportBanner } from "@/components/admin/poster-import-banner";
import { QuoteForm } from "@/components/admin/quote-form";
import { QuotePackagePicker } from "@/components/admin/quote-package-picker";

export const metadata: Metadata = {
  title: "New Quote | TravelSentro Admin",
};

// extractQuoteFromPoster inherits this page's segment config; same 2-minute
// cap as the package edit page (60s client timeout + 1 retry).
export const maxDuration = 120;

export default async function NewQuotePage() {
  await requirePermissionOrRedirect("can_manage_quotes");

  const supabase = await createClient();
  const [contactsResult, packagesResult] = await Promise.all([
    supabase.from("contacts").select("id, name, email").order("name"),
    supabase
      .from("packages")
      .select("id, name, slug")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (contactsResult.error) console.error("Failed to load contacts:", contactsResult.error.message);
  if (packagesResult.error) console.error("Failed to load packages:", packagesResult.error.message);

  return (
    <PosterImportProvider>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="New Quote"
          description="Start blank, import a flyer, or copy a published package — then adjust and save."
        >
          <div className="flex flex-wrap items-center gap-3">
            <QuotePackagePicker packages={packagesResult.data ?? []} />
            <PosterImportButton
              extract={extractQuoteFromPoster}
              noun="flyer"
              label="Import from Flyer"
            />
          </div>
        </PageHeader>

        <PosterImportBanner />

        <QuoteForm contacts={contactsResult.data ?? []} />
      </div>
    </PosterImportProvider>
  );
}
```

`app/admin/(dashboard)/quotes/[id]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { quoteRowToFormValues } from "@/lib/quotes/quote-row";
import { PageHeader } from "@/components/admin/page-header";
import { PosterImportProvider } from "@/components/admin/poster-import-context";
import { QuoteForm } from "@/components/admin/quote-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Edit Quote | TravelSentro Admin",
};

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const [quoteResult, contactsResult] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).maybeSingle(),
    supabase.from("contacts").select("id, name, email").order("name"),
  ]);

  if (quoteResult.error) console.error("Failed to load quote:", quoteResult.error.message);
  if (!quoteResult.data) notFound();
  if (contactsResult.error) console.error("Failed to load contacts:", contactsResult.error.message);

  const quote = quoteResult.data;
  // Throws on malformed stored jsonb -> the admin error boundary, never a
  // half-filled form (Review Focus #2).
  const defaultValues = quoteRowToFormValues(quote);

  return (
    // QuoteForm's useFormImport needs the provider even though nothing on
    // this page imports.
    <PosterImportProvider>
      <div className="flex flex-col gap-6">
        <PageHeader title={`Quote ${quote.quote_no}`} description={quote.title}>
          <Button
            variant="outline"
            size="lg"
            render={<a href={`/admin/quotes/${quote.id}/pdf`} download />}
          >
            Download PDF
          </Button>
        </PageHeader>

        <QuoteForm
          quoteId={quote.id}
          defaultValues={defaultValues}
          contacts={contactsResult.data ?? []}
        />
      </div>
    </PosterImportProvider>
  );
}
```

- [ ] **Step 5: Add the sidebar entry**

`app/admin/(dashboard)/layout.tsx` — after the `canManageVouchers` line add:
```ts
  const canManageQuotes = profile.role === "admin" || profile.can_manage_quotes;
```
and pass `canManageQuotes={canManageQuotes}` to `<AdminNav ... />`.

`components/admin/admin-nav.tsx`:
- add `FileTextIcon` to the `lucide-react` import
- add `canManageQuotes` to the props destructure and its type (`canManageQuotes: boolean;`)
- insert after the Vouchers item:
```ts
    {
      href: "/admin/quotes",
      label: "Quotes",
      icon: FileTextIcon,
      show: canManageQuotes,
    },
```

- [ ] **Step 6: Type-check, lint, build, and verify end to end**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean.

Point `.env.local` at the local stack for this step (the remote project lacks the migration) — back it up first: `cp .env.local $SCRATCH/env.local.bak`, swap the three Supabase values for `npx supabase status` output, keep `ANTHROPIC_API_KEY`. Seed an admin if the local DB has none (`npm run seed:admin`). Run `npm run dev` and check, in order:

1. Sidebar shows **Quotes** for an admin. `/admin/quotes` shows the empty state.
2. **New Quote** → type title, price, duration, one travel date → **Create Quote** → redirected to `/admin/quotes/<id>`, header reads `Quote TSQ-000001` (or next number).
3. **Download PDF** → file named `TSQ-00000N.pdf`; layout matches a package's Download Full Itinerary (logo, title, duration, price/pax, sections, footer); no quote number or customer name printed.
4. New Quote → **Copy from a package** → pick a published package → form fills, Details tab active, toast `Loaded "…"`. Save → open the new quote's PDF next to that package's admin Download Full Itinerary PDF: they must look identical. Then edit the package's price and re-download the quote PDF: quote price unchanged (frozen copy).
5. New Quote → type a title → **Import from Flyer** with a flyer image → "Replace what you've entered?" appears (Review Focus #1); Replace → form fills, banner lists missing items with "Quote title"/Details-tab wording and no Destination row. Save.
6. On a saved quote, remove a filled itinerary day → confirmation reads "…once you save the quote."
7. Submit a quote with no travel dates → Travel Dates tab opens with "Add at least one travel date".
8. Pick a CRM contact with an empty customer name → customer name fills with the contact's name; the list shows it in the Customer column.
9. Delete a quote from the list → confirm → row disappears.
10. Create a staff account (Users → Add) with only **Manage Quotes** on → Quotes visible in their sidebar, everything above works. Turn it off → sidebar item gone; visiting `/admin/quotes`, `/admin/quotes/new` and `/admin/quotes/<id>/pdf` shows the forbidden page (Review Focus #4). The Users table shows a **Quotes** badge while it's on.

Restore `.env.local` afterward: `cp $SCRATCH/env.local.bak .env.local`.

- [ ] **Step 7: Run the full verification set**

Run (local-stack env exported): `npm run verify:quote-rls && npm run verify:quote-pdf`
Run: `npm run verify:quote-values && npm run verify:poster-extraction`
Run (remote `.env.local`, fresh shell): `npm run verify:package-pdf`
Expected: every suite PASS.

- [ ] **Step 8: Commit**

```bash
git add components/admin/quote-form.tsx components/admin/quote-package-picker.tsx components/admin/quote-table.tsx "app/admin/(dashboard)/quotes" components/admin/admin-nav.tsx "app/admin/(dashboard)/layout.tsx"
git commit -m "feat: add quotes admin pages, form and sidebar entry"
```

---

## Deployment Note (not a task — for the user)

The migration must be pushed to the remote/production Supabase project (`npx supabase db push` or the team's usual path) before deploying this code, and the `profiles` permission for each staff member who should create quotes must be switched on under Users. No new environment variables: flyer import reuses `ANTHROPIC_API_KEY` / `POSTER_EXTRACTION_MODEL`.
