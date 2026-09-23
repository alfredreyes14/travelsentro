# Upsell Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-managed popup to the public site that shows a shuffled, arrow-paginated selection of packages once per visitor session, shortly after their first page load.

**Architecture:** New `upsell_items` table (package_id + created_at only, no display order — the public side always shuffles) with the same RLS shape as `hero_slides`/`testimonials`. Admin CRUD lives as a third tab on the existing `/admin/content` page. The public side fetches upsell items in the shared `(public)/layout.tsx` (so it covers every public route, not just the homepage) and hands them to a client `<UpsellPopup>` component that shuffles them client-side, shows the popup once per `sessionStorage`-tracked browser session, and paginates one item at a time with prev/next arrows.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), existing shadcn/ui + Base UI Dialog primitives, no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-upsell-popup-design.md`

## Global Constraints

- No new npm dependencies — everything needed (`lucide-react`, `sonner`, Base UI Dialog, `@supabase/supabase-js`) is already installed.
- `upsell_items` has **no `sort_order` column and no drag-reorder admin UI** — the public popup always shuffles into a random order on every appearance, so a stored order would never be respected.
- `upsell_items` links to existing `packages` rows only — no custom headline/description/image fields, no promo-type variant.
- RLS mirrors `hero_slides`' shape exactly: unconditional public `select` (`using (true)`), `can_manage_packages`-gated authenticated `insert`/`delete` via the existing `has_permission()` helper. No `update` policy — there's nothing on the row to edit besides membership.
- The popup shows **once per browser session** (`sessionStorage`, not `localStorage`) and **never re-triggers** later in the same session by any mechanism (no exit-intent, no random reappearance) — confirmed during design.
- Popup pagination is **manual, arrow-driven, one item at a time** — not an autoplaying carousel, no looping at the ends.
- Any admin action that mutates `upsell_items` must call `revalidatePath("/", "layout")` (not `revalidatePath("/")`), because the popup renders in the shared public layout that wraps every public route.
- This codebase has no automated test runner (no jest/vitest) — pure-logic modules get a `tsx`-run `scripts/verify-*.ts` script (mirrors `scripts/verify-unsubscribe-token-secret.ts`'s `CheckResult`/PASS-FAIL structure); UI and Server Action changes are verified manually via `npm run dev`, per this project's established convention.
- `.env.local` defaults to a **remote** Supabase project, not the local CLI stack — the new migration only exists locally until pushed. Any step that needs to see `upsell_items` live (type regen, RLS proof script, manual admin/public QA) must target the local stack explicitly (get its URL/anon key from `npx supabase status`), not rely on `.env.local`'s default.

## Review Focus

- RLS actually blocks an anonymous/unauthenticated write to `upsell_items`, not just that the policy SQL parses — Task 1's `verify-upsell-rls.ts`.
- A package linked to an upsell item gets unpublished or soft-deleted after being added — the public popup must exclude it silently (RLS returns `packages: null`), never crash or show a broken image — Task 6's manual QA.
- Zero eligible packages remain for the admin's "Add Item" picker (every published package is already in the list) — the dialog must show a clear message, never crash on an empty `<Select>` — Task 5's manual QA.
- Exactly one upsell item is configured — the popup's prev/next arrows and "X / Y" counter must be fully **hidden**, not merely disabled — Task 6's manual QA.
- Zero upsell items are configured at all — the popup component must never open (no empty dialog flash, no crash on an empty items array) — Task 6's manual QA.

---

### Task 1: Database schema — `upsell_items` table + RLS

**Files:**
- Create: `supabase/migrations/20260923120000_create_upsell_items_schema.sql`
- Modify: `types/database.ts` (regenerated, not hand-edited)
- Create: `scripts/verify-upsell-rls.ts`
- Modify: `package.json` (add `verify:upsell-rls` script)

**Interfaces:**
- Produces: `upsell_items` table — columns `id: uuid`, `package_id: uuid` (FK to `packages.id`, `on delete cascade`, `unique`), `created_at: timestamptz`. After type regeneration, `Database["public"]["Tables"]["upsell_items"]["Row" | "Insert" | "Update"]` becomes available for every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260923120000_create_upsell_items_schema.sql`:

```sql
-- Upsell popup catalog -- the public-site popup shows an admin-picked set
-- of packages, once per visitor session, shuffled into a random order on
-- every appearance (client-side, see components/upsell/upsell-popup.tsx --
-- never stored here).
--
-- upsell_items links to existing packages only -- no custom headline/
-- image/link fields like hero_slides' promo variant, since the popup
-- always renders live package data (name/photo/price). No sort_order
-- column and no update policy: the only mutations are add (insert) and
-- remove (delete), and nothing else on the row is ever edited.
--
-- RLS mirrors hero_slides' shape exactly
-- (20260727075208_create_homepage_content_schema.sql): unconditional
-- public SELECT, can_manage_packages-scoped authenticated INSERT/DELETE
-- via the existing has_permission() SECURITY DEFINER helper. Purely
-- additive -- does not modify has_permission(), packages, or any earlier
-- table/policy.
create table upsell_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (package_id)
);

alter table upsell_items enable row level security;

create policy "public read" on upsell_items
  for select using (true);

create policy "manage_packages can read all upsell_items" on upsell_items
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert upsell_items" on upsell_items
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete upsell_items" on upsell_items
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
```

- [ ] **Step 2: Apply it locally**

Run: `npx supabase status`
Expected: prints a running local stack (API URL `http://127.0.0.1:54321`, etc). If it's not running, run `npx supabase start` first — if that fails because the default ports are already bound by an unrelated project's stack, run `docker ps --format '{{.Names}}\t{{.Ports}}'` to identify it and confirm with the user before stopping it (see this project's own port-conflict notes — don't guess).

Run: `npx supabase db reset`
Expected: every migration reapplies cleanly from scratch, ending with `...create_upsell_items_schema.sql ... OK` (or equivalent success output) and no SQL errors.

- [ ] **Step 3: Regenerate types**

Run: `npx supabase gen types typescript --local > types/database.ts`

Run: `grep -n "upsell_items" types/database.ts`
Expected: shows a new `upsell_items: { Row: {...}, Insert: {...}, Update: {...}, Relationships: [...] }` block with `id`, `package_id`, `created_at` fields.

- [ ] **Step 4: Add the RLS proof script**

Create `scripts/verify-upsell-rls.ts`:

```ts
/**
 * Proves upsell_items' RLS actually blocks anonymous writes (and allows
 * anonymous reads), not just that the policy SQL parses. Mirrors
 * scripts/verify-unsubscribe-token-secret.ts's CheckResult/PASS-FAIL
 * console-summary structure. Uses only the anon key -- no service role --
 * since the whole point is proving what an unauthenticated visitor's
 * client can and can't do.
 *
 * Run via `npm run verify:upsell-rls`. Point NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY at whichever project has the
 * upsell_items migration applied (the local stack, until it's pushed
 * elsewhere) -- `.env.local` defaults to a remote project that won't
 * have this table yet.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. " +
      "Point these at a project with the upsell_items migration applied, then run " +
      "`npm run verify:upsell-rls`."
  );
}

const anon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function checkAnonReadSucceeds(): Promise<CheckResult> {
  const { error } = await anon.from("upsell_items").select("id").limit(1);
  const pass = !error;
  return {
    name: "Anonymous SELECT on upsell_items succeeds (public read policy)",
    pass,
    detail: pass ? "no error" : `unexpected error: ${error?.message}`,
  };
}

async function checkAnonInsertRejected(): Promise<CheckResult> {
  const { data: pkg, error: pkgError } = await anon
    .from("packages")
    .select("id")
    .eq("is_published", true)
    .limit(1)
    .single();

  if (pkgError || !pkg) {
    return {
      name: "Anonymous INSERT on upsell_items is rejected by RLS",
      pass: false,
      detail: `could not find a published package to test against: ${pkgError?.message ?? "no rows"}`,
    };
  }

  const { error } = await anon
    .from("upsell_items")
    .insert({ package_id: pkg.id });

  const pass = !!error;
  return {
    name: "Anonymous INSERT on upsell_items is rejected by RLS",
    pass,
    detail: pass
      ? `insert rejected as expected: ${error?.message}`
      : "insert unexpectedly succeeded -- RLS is not blocking anonymous writes",
  };
}

async function main() {
  const results: CheckResult[] = [
    await checkAnonReadSucceeds(),
    await checkAnonInsertRejected(),
  ];

  console.log(`\nverify-upsell-rls\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-upsell-rls failed:", err);
  process.exit(1);
});
```

Add this line to `package.json`'s `"scripts"` object, alongside the other `verify:*` entries:

```json
    "verify:upsell-rls": "tsx --env-file=.env.local scripts/verify-upsell-rls.ts",
```

- [ ] **Step 5: Run it against the local stack**

Run: `npx supabase status` and note the `API URL` and `anon key` values.

Run (substituting those two values — shell-set env vars here take precedence over `--env-file=.env.local`'s remote defaults):

```bash
NEXT_PUBLIC_SUPABASE_URL=<API URL from supabase status> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status> \
npm run verify:upsell-rls
```

Expected: `PASS: 2/2 checks passed`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260923120000_create_upsell_items_schema.sql types/database.ts scripts/verify-upsell-rls.ts package.json
git commit -m "feat: add upsell_items table and RLS"
```

---

### Task 2: Shared package price formatting helper

**Files:**
- Create: `lib/packages/format-price.ts`
- Create: `scripts/verify-format-price.ts`
- Modify: `package.json` (add `verify:format-price` script)
- Modify: `components/packages/package-card.tsx`

**Interfaces:**
- Produces: `formatPackagePrice(pricePerPax: number, discountAmount: number | null): { original: string | null; final: string }` — consumed by `components/packages/package-card.tsx` (Task 2) and Tasks 5/6's upsell display mapping.

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-format-price.ts`:

```ts
/**
 * Pure-logic proof for lib/packages/format-price.ts's formatPackagePrice --
 * mirrors scripts/verify-unsubscribe-token-secret.ts's CheckResult/PASS-FAIL
 * structure. No network/Supabase access needed.
 *
 * Run via `npm run verify:format-price`.
 */
import { formatPackagePrice } from "../lib/packages/format-price";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkNoDiscount(): CheckResult {
  const result = formatPackagePrice(12000, null);
  const pass = result.original === null && result.final === "₱12,000 / pax";
  return {
    name: "No discount: original is null, final is the plain formatted price",
    pass,
    detail: `original=${JSON.stringify(result.original)} final=${JSON.stringify(result.final)}`,
  };
}

function checkWithDiscount(): CheckResult {
  const result = formatPackagePrice(12000, 2000);
  const pass = result.original === "₱12,000" && result.final === "₱10,000 / pax";
  return {
    name: "With discount: original is the pre-discount price, final is discounted",
    pass,
    detail: `original=${JSON.stringify(result.original)} final=${JSON.stringify(result.final)}`,
  };
}

function checkZeroDiscountTreatedAsNoDiscount(): CheckResult {
  const result = formatPackagePrice(12000, 0);
  const pass = result.original === null && result.final === "₱12,000 / pax";
  return {
    name: "Zero discount_amount is treated the same as no discount",
    pass,
    detail: `original=${JSON.stringify(result.original)} final=${JSON.stringify(result.final)}`,
  };
}

function main() {
  const results = [
    checkNoDiscount(),
    checkWithDiscount(),
    checkZeroDiscountTreatedAsNoDiscount(),
  ];

  console.log(`\nverify-format-price\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/verify-format-price.ts`
Expected: FAIL — module not found (`Cannot find module '../lib/packages/format-price'`).

- [ ] **Step 3: Implement the helper**

Create `lib/packages/format-price.ts`:

```ts
/**
 * Formats a package's price for display -- shared by PackageCard and the
 * upsell popup so the ₱-formatting/discount-strikethrough logic isn't
 * duplicated a second time. `original` is null when there's no discount
 * (nothing to strike through); `final` always includes the "/ pax" suffix.
 */
export function formatPackagePrice(
  pricePerPax: number,
  discountAmount: number | null
): { original: string | null; final: string } {
  return {
    original: discountAmount
      ? `₱${pricePerPax.toLocaleString("en-PH")}`
      : null,
    final: `₱${(pricePerPax - (discountAmount ?? 0)).toLocaleString("en-PH")} / pax`,
  };
}
```

- [ ] **Step 4: Run it again to confirm it passes**

Run: `npx tsx scripts/verify-format-price.ts`
Expected: `PASS: 3/3 checks passed`.

Add this line to `package.json`'s `"scripts"` object:

```json
    "verify:format-price": "tsx scripts/verify-format-price.ts",
```

- [ ] **Step 5: Refactor PackageCard to use the shared helper**

In `components/packages/package-card.tsx`, add the import:

```ts
import { formatPackagePrice } from "@/lib/packages/format-price";
```

Inside `PackageCard`, right before the `return (`, add:

```ts
  const price = formatPackagePrice(pkg.price_per_pax, pkg.discount_amount);
```

Replace this block:

```tsx
          <div className="flex items-center gap-1.5">
            {pkg.discount_amount ? (
              <span className="text-xs text-white/70 text-shadow-sm line-through">
                ₱{pkg.price_per_pax.toLocaleString("en-PH")}
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className="h-auto px-3 py-1 text-sm font-semibold shadow-md"
            >
              ₱
              {(
                pkg.price_per_pax - (pkg.discount_amount ?? 0)
              ).toLocaleString("en-PH")}{" "}
              / pax
            </Badge>
          </div>
```

with:

```tsx
          <div className="flex items-center gap-1.5">
            {price.original ? (
              <span className="text-xs text-white/70 text-shadow-sm line-through">
                {price.original}
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className="h-auto px-3 py-1 text-sm font-semibold shadow-md"
            >
              {price.final}
            </Badge>
          </div>
```

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev`, visit `/packages`. Confirm prices still render exactly as before — a discounted package still shows a struck-through original price next to the discounted badge, and a non-discounted package shows just the plain price.

- [ ] **Step 7: Commit**

```bash
git add lib/packages/format-price.ts scripts/verify-format-price.ts package.json components/packages/package-card.tsx
git commit -m "refactor: extract shared package price formatting helper"
```

---

### Task 3: Shuffle helper

**Files:**
- Create: `lib/upsell/shuffle.ts`
- Create: `scripts/verify-shuffle.ts`
- Modify: `package.json` (add `verify:shuffle` script)

**Interfaces:**
- Produces: `shuffle<T>(items: T[]): T[]` — pure, non-mutating Fisher–Yates shuffle, consumed by Task 6's `UpsellPopup` component.

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-shuffle.ts`:

```ts
/**
 * Pure-logic proof for lib/upsell/shuffle.ts -- mirrors
 * scripts/verify-unsubscribe-token-secret.ts's CheckResult/PASS-FAIL
 * structure. No network/Supabase access needed.
 *
 * Run via `npm run verify:shuffle`.
 */
import { shuffle } from "../lib/upsell/shuffle";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkSameElements(): CheckResult {
  const input = ["a", "b", "c", "d", "e"];
  const result = shuffle(input);
  const pass =
    result.length === input.length &&
    [...result].sort().join(",") === [...input].sort().join(",");
  return {
    name: "Shuffled array has the same elements as the input",
    pass,
    detail: `input=${JSON.stringify(input)} result=${JSON.stringify(result)}`,
  };
}

function checkDoesNotMutateInput(): CheckResult {
  const input = ["a", "b", "c", "d", "e"];
  const before = [...input];
  shuffle(input);
  const pass = input.join(",") === before.join(",");
  return {
    name: "shuffle() does not mutate its input array",
    pass,
    detail: `input after call=${JSON.stringify(input)} (expected unchanged: ${JSON.stringify(before)})`,
  };
}

function checkProducesDifferentOrders(): CheckResult {
  const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const orderings = new Set<string>();
  for (let i = 0; i < 20; i++) {
    orderings.add(shuffle(input).join(","));
  }
  // With 8 elements, the chance all 20 runs land on the exact same
  // ordering by pure luck is astronomically small -- this is a real proof
  // of randomness, not a flaky test.
  const pass = orderings.size > 1;
  return {
    name: "shuffle() produces more than one distinct ordering across repeated calls",
    pass,
    detail: `saw ${orderings.size} distinct ordering(s) across 20 calls`,
  };
}

function main() {
  const results = [
    checkSameElements(),
    checkDoesNotMutateInput(),
    checkProducesDifferentOrders(),
  ];

  console.log(`\nverify-shuffle\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/verify-shuffle.ts`
Expected: FAIL — module not found (`Cannot find module '../lib/upsell/shuffle'`).

- [ ] **Step 3: Implement the helper**

Create `lib/upsell/shuffle.ts`:

```ts
/**
 * Fisher-Yates shuffle -- returns a new array in random order, never
 * mutates `items`. Used by the upsell popup to show a fresh random order
 * on every appearance (client-side only -- see
 * docs/superpowers/specs/2026-09-23-upsell-popup-design.md's Data fetching
 * section for why this can't happen in the ISR-cached server query).
 */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

- [ ] **Step 4: Run it again to confirm it passes**

Run: `npx tsx scripts/verify-shuffle.ts`
Expected: `PASS: 3/3 checks passed`.

Add this line to `package.json`'s `"scripts"` object:

```json
    "verify:shuffle": "tsx scripts/verify-shuffle.ts",
```

- [ ] **Step 5: Commit**

```bash
git add lib/upsell/shuffle.ts scripts/verify-shuffle.ts package.json
git commit -m "feat: add shuffle helper for upsell popup ordering"
```

---

### Task 4: Server Actions — add/remove upsell items

**Files:**
- Create: `actions/upsell-items.ts`

**Interfaces:**
- Consumes: `requirePermission("can_manage_packages")` from `lib/auth/dal.ts`; `createClient()` from `lib/supabase/server.ts`; `ActionResult` from `lib/action-result.ts`; the `upsell_items` table from Task 1.
- Produces: `addUpsellItem(packageId: string): Promise<ActionResult & { id?: string }>`, `removeUpsellItem(id: string): Promise<ActionResult>` — consumed by Task 5's `UpsellItemsList`.

- [ ] **Step 1: Write the actions**

Create `actions/upsell-items.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Adds a package to the upsell popup. upsell_items.package_id is unique,
 * so a duplicate add (e.g. a race between two admins, or a stale picker
 * option) fails the insert -- surfaced as the same generic error every
 * other content-management action uses, not a raw DB error.
 */
export async function addUpsellItem(
  packageId: string
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: created, error: createError } = await supabase
    .from("upsell_items")
    .insert({ package_id: packageId })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  // "layout", not the default "page" -- the popup renders in the shared
  // (public)/layout.tsx, which wraps every public route, so a page-only
  // revalidation would leave every route besides "/" showing stale items.
  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
  return { ok: true, id: created.id };
}

export async function removeUpsellItem(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("upsell_items")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors reported for `actions/upsell-items.ts` (functional verification happens live in Task 5, once the admin UI can actually call these).

- [ ] **Step 3: Commit**

```bash
git add actions/upsell-items.ts
git commit -m "feat: add upsell item Server Actions"
```

---

### Task 5: Admin UI — Upsell Popup tab

**Files:**
- Create: `components/admin/content/upsell-items-list.tsx`
- Modify: `app/admin/(dashboard)/content/page.tsx`

**Interfaces:**
- Consumes: `addUpsellItem`, `removeUpsellItem` from `actions/upsell-items.ts` (Task 4); `formatPackagePrice` from `lib/packages/format-price.ts` (Task 2); `getPublicImageUrl` from `lib/storage/image-url.ts`.
- Produces: `UpsellItemsList` component with props `{ initialItems: UpsellItemListItem[]; packageOptions: UpsellPackageOption[] }`, and exported types `UpsellItemListItem = { id: string; packageId: string; packageName: string; imageUrl: string | null; priceLabel: string }`, `UpsellPackageOption = { id: string; name: string }`.

- [ ] **Step 1: Create the list component**

Create `components/admin/content/upsell-items-list.tsx`:

```tsx
"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { addUpsellItem, removeUpsellItem } from "@/actions/upsell-items";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/** Display-ready upsell_items row, assembled server-side by /admin/content. */
export type UpsellItemListItem = {
  id: string;
  packageId: string;
  packageName: string;
  imageUrl: string | null;
  priceLabel: string;
};

export type UpsellPackageOption = {
  id: string;
  name: string;
};

/**
 * Add/remove-only list for the upsell popup catalog -- no drag-reorder
 * (public display always shuffles, so a stored order would never be
 * respected -- see the design doc) and no edit form (nothing to edit
 * besides membership: which package, present or absent). Mirrors
 * testimonials-list.tsx's exact table/card composition and
 * hero-slides-list.tsx's AlertDialog delete-confirmation pattern.
 */
export function UpsellItemsList({
  initialItems,
  packageOptions,
}: {
  initialItems: UpsellItemListItem[];
  packageOptions: UpsellPackageOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  // Adjusts `items` when fresh props arrive after router.refresh() -- see
  // hero-slides-list.tsx/testimonials-list.tsx for why this runs during
  // render, not in an Effect.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<UpsellItemListItem | null>(
    null
  );
  const [isDeleting, startDeleting] = useTransition();

  function handleAddSuccess() {
    setIsAddOpen(false);
    router.refresh();
  }

  function handleDelete() {
    if (!deletingItem) return;
    const target = deletingItem;

    startDeleting(async () => {
      try {
        const result = await removeUpsellItem(target.id);
        if (result.ok) {
          toast.success("Removed from the upsell popup.");
          setItems((current) => current.filter((item) => item.id !== target.id));
          setDeletingItem(null);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={<Button size="lg" />}>Add Item</DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Upsell Item</DialogTitle>
            </DialogHeader>
            <AddUpsellItemForm
              packageOptions={packageOptions}
              onSuccess={handleAddSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No upsell items yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add packages to feature in the popup shown to first-time
            visitors on the public site.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.packageName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.priceLabel}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeletingItem(item)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{item.packageName}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.priceLabel}
                  </p>
                </div>
                <div className="mt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeletingItem(item)}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingItem?.packageName} will stop appearing in the upsell
              popup immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddUpsellItemForm({
  packageOptions,
  onSuccess,
}: {
  packageOptions: UpsellPackageOption[];
  onSuccess: () => void;
}) {
  const [packageId, setPackageId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const packageItems = packageOptions.map(({ id, name }) => ({
    value: id,
    label: name,
  }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!packageId) return;

    setIsSubmitting(true);
    try {
      const result = await addUpsellItem(packageId);
      if (result.ok) {
        toast.success("Added to the upsell popup.");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (packageOptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every published package is already in the upsell popup -- publish a
        new package, or remove one from the list first, to add another.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Select items={packageItems} value={packageId} onValueChange={setPackageId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a package" />
        </SelectTrigger>
        <SelectContent>
          {packageOptions.map((pkg) => (
            <SelectItem key={pkg.id} value={pkg.id}>
              {pkg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || !packageId}
        className="self-end"
      >
        {isSubmitting ? "Adding..." : "Add Item"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Wire the new tab into the content page**

Replace the full contents of `app/admin/(dashboard)/content/page.tsx` with:

```tsx
import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { formatPackagePrice } from "@/lib/packages/format-price";
import {
  HeroSlidesList,
  type HeroSlideListItem,
} from "@/components/admin/content/hero-slides-list";
import type {
  HeroSlidePackageOption,
  HeroSlideRecord,
} from "@/components/admin/content/hero-slide-form";
import { TestimonialsList } from "@/components/admin/content/testimonials-list";
import type { TestimonialRecord } from "@/components/admin/content/testimonial-form";
import {
  UpsellItemsList,
  type UpsellItemListItem,
  type UpsellPackageOption,
} from "@/components/admin/content/upsell-items-list";
import { PageHeader } from "@/components/admin/page-header";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Homepage Content | TravelSentro Admin",
};

type PackagePhotoRow = Pick<
  Database["public"]["Tables"]["package_photos"]["Row"],
  "storage_path" | "display_order"
>;

type HeroSlideRow = Database["public"]["Tables"]["hero_slides"]["Row"] & {
  packages:
    | (Pick<Database["public"]["Tables"]["packages"]["Row"], "id" | "name"> & {
        package_photos: PackagePhotoRow[];
      })
    | null;
};

type UpsellItemRow = Database["public"]["Tables"]["upsell_items"]["Row"] & {
  packages:
    | (Pick<
        Database["public"]["Tables"]["packages"]["Row"],
        "id" | "name" | "price_per_pax" | "discount_amount"
      > & { package_photos: PackagePhotoRow[] })
    | null;
};

export default async function AdminContentPage() {
  // AUTH-05 (T-06-21) -- gate independent of Task 2's nav hiding; RLS is the
  // second, independent enforcement layer.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  const [
    { data: heroSlideRows, error: heroSlidesError },
    { data: packageOptionRows, error: packagesError },
    { data: testimonialRows, error: testimonialsError },
    { data: upsellItemRows, error: upsellItemsError },
    { data: publishedPackageRows, error: publishedPackagesError },
  ] = await Promise.all([
    supabase
      .from("hero_slides")
      .select("*, packages(id, name, package_photos(storage_path, display_order))")
      .order("sort_order", { ascending: true }),
    // Pitfall 2 -- the ONLY place in the codebase this exact filtered query
    // runs. Only featured, published, non-deleted packages are valid hero
    // slide candidates (T-06-22).
    supabase.from("packages").select("id, name").eq("is_featured", true).eq("is_published", true).is("deleted_at", null).order("name"),
    supabase.from("testimonials").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("upsell_items")
      .select(
        "*, packages(id, name, price_per_pax, discount_amount, package_photos(storage_path, display_order))"
      )
      .order("created_at", { ascending: true }),
    // Upsell items aren't restricted to featured packages (unlike hero
    // slides above) -- any published, non-deleted package is eligible.
    supabase
      .from("packages")
      .select("id, name")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (heroSlidesError) {
    console.error("Failed to load hero slides:", heroSlidesError.message);
  }
  if (packagesError) {
    console.error(
      "Failed to load package picker options:",
      packagesError.message
    );
  }
  if (testimonialsError) {
    console.error("Failed to load testimonials:", testimonialsError.message);
  }
  if (upsellItemsError) {
    console.error("Failed to load upsell items:", upsellItemsError.message);
  }
  if (publishedPackagesError) {
    console.error(
      "Failed to load published packages:",
      publishedPackagesError.message
    );
  }

  const packages: HeroSlidePackageOption[] = (packageOptionRows ?? []).map(
    (pkg) => ({
      id: pkg.id,
      name: pkg.name,
    })
  );

  const heroSlides: HeroSlideListItem[] = ((heroSlideRows ?? []) as HeroSlideRow[]).map(
    (row) => {
      const record: HeroSlideRecord = {
        id: row.id,
        slideType: row.slide_type as "package" | "promo",
        packageId: row.package_id,
        imageStoragePath: row.image_storage_path,
        headline: row.headline,
        subheading: row.subheading,
        ctaLabel: row.cta_label,
        externalLink: row.external_link,
        sortOrder: row.sort_order,
      };

      let imageUrl: string | null = null;
      if (row.slide_type === "package" && row.packages) {
        const [firstPhoto] = [...row.packages.package_photos].sort(
          (a, b) => a.display_order - b.display_order
        );
        imageUrl = firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null;
      } else if (row.image_storage_path) {
        imageUrl = getPublicImageUrl(row.image_storage_path);
      }

      return {
        ...record,
        packageName: row.packages?.name ?? null,
        imageUrl,
      };
    }
  );

  const testimonials: TestimonialRecord[] = (testimonialRows ?? []).map(
    (row) => ({
      id: row.id,
      customerName: row.customer_name,
      quote: row.quote,
      rating: row.rating,
      photoStoragePath: row.photo_storage_path,
    })
  );

  // Same RLS-null-filter as the public homepage's hero-slide query: an
  // upsell item whose linked package has since been unpublished or
  // soft-deleted comes back with `packages: null`, and is dropped here
  // rather than rendered broken.
  const upsellItems: UpsellItemListItem[] = ((upsellItemRows ?? []) as UpsellItemRow[])
    .map((row) => {
      const pkg = row.packages;
      if (!pkg) return null;

      const [firstPhoto] = [...pkg.package_photos].sort(
        (a, b) => a.display_order - b.display_order
      );
      const price = formatPackagePrice(pkg.price_per_pax, pkg.discount_amount);

      const item: UpsellItemListItem = {
        id: row.id,
        packageId: pkg.id,
        packageName: pkg.name,
        imageUrl: firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null,
        priceLabel: price.final,
      };
      return item;
    })
    .filter((item): item is UpsellItemListItem => item !== null);

  const upsellPackageIds = new Set(upsellItems.map((item) => item.packageId));
  const upsellPackageOptions: UpsellPackageOption[] = (publishedPackageRows ?? [])
    .filter((pkg) => !upsellPackageIds.has(pkg.id))
    .map((pkg) => ({ id: pkg.id, name: pkg.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Homepage Content"
        description="Manage the hero carousel and homepage content sections — changes go live on the public site immediately."
      />

      <Tabs defaultValue="hero-slides">
        <TabsList>
          <TabsTrigger value="hero-slides">{"Hero Slides"}</TabsTrigger>
          <TabsTrigger value="testimonials">{"Testimonials"}</TabsTrigger>
          <TabsTrigger value="upsell-popup">{"Upsell Popup"}</TabsTrigger>
        </TabsList>

        <TabsContent value="hero-slides" keepMounted className="pt-4">
          <HeroSlidesList initialSlides={heroSlides} packages={packages} />
        </TabsContent>

        <TabsContent value="testimonials" keepMounted className="pt-4">
          <TestimonialsList initialItems={testimonials} />
        </TabsContent>

        <TabsContent value="upsell-popup" keepMounted className="pt-4">
          <UpsellItemsList
            initialItems={upsellItems}
            packageOptions={upsellPackageOptions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/admin/content/upsell-items-list.tsx` or `app/admin/(dashboard)/content/page.tsx`.

- [ ] **Step 4: Manual QA (point at the local Supabase stack from Task 1 — swap `.env.local`'s Supabase URL/anon/service-role values for `npx supabase status`'s local ones, or export them inline for `npm run dev`)**

Run: `npm run dev`, log into `/admin/login` with an Admin account, go to `/admin/content`, click the new **Upsell Popup** tab.

1. Confirm the empty state ("No upsell items yet") renders.
2. Click **Add Item** — confirm the `<Select>` lists published packages. Add one. Confirm a success toast and the row appears with its price.
3. Repeat **Add Item** until every currently-published package has been added (however many are seeded). Open **Add Item** one more time — confirm it shows "Every published package is already in the upsell popup..." instead of an empty/broken `<Select>` (Review Focus: exhausted picker).
4. Click **Remove** on one row, confirm the delete-confirmation dialog, confirm it disappears from the list after confirming.
5. Remove the rest, leaving the catalog back at a small number of items for Task 6's QA (e.g. 2 items).

- [ ] **Step 5: Commit**

```bash
git add components/admin/content/upsell-items-list.tsx "app/admin/(dashboard)/content/page.tsx"
git commit -m "feat: add Upsell Popup admin tab"
```

---

### Task 6: Public popup — component + layout wiring

**Files:**
- Create: `components/upsell/upsell-popup.tsx`
- Modify: `app/(public)/layout.tsx`

**Interfaces:**
- Consumes: `shuffle` from `lib/upsell/shuffle.ts` (Task 3); `formatPackagePrice` from `lib/packages/format-price.ts` (Task 2); `getPublicImageUrl` from `lib/storage/image-url.ts`; `createPublicClient` from `lib/supabase/public.ts`.
- Produces: `UpsellPopup` component with prop `{ items: UpsellItemDisplay[] }`, and exported type `UpsellItemDisplay = { id: string; slug: string; name: string; imageUrl: string | null; durationLabel: string | null; priceOriginal: string | null; priceFinal: string }`.

- [ ] **Step 1: Create the popup component**

Create `components/upsell/upsell-popup.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { shuffle } from "@/lib/upsell/shuffle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SESSION_STORAGE_KEY = "ts-upsell-seen";
const OPEN_DELAY_MS = 1500;

export type UpsellItemDisplay = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  durationLabel: string | null;
  priceOriginal: string | null;
  priceFinal: string;
};

/**
 * Site-wide upsell popup, mounted once in (public)/layout.tsx. Shows once
 * per browser session (sessionStorage flag, set the moment it opens,
 * regardless of how it's later closed -- no re-trigger of any kind, per
 * docs/superpowers/specs/2026-09-23-upsell-popup-design.md). Items are
 * shuffled into a random order fresh on every appearance -- has to happen
 * here (client-side), not in the server query, since (public)/layout.tsx
 * is ISR-cached and a server-side shuffle would bake one fixed order into
 * the cached HTML for every visitor within the revalidation window.
 */
export function UpsellPopup({ items }: { items: UpsellItemDisplay[] }) {
  const [open, setOpen] = useState(false);
  const [shuffled, setShuffled] = useState<UpsellItemDisplay[]>([]);
  const [index, setIndex] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(SESSION_STORAGE_KEY) === "1";
    } catch {
      // sessionStorage can throw in some private-browsing modes -- treat
      // that the same as "not seen yet" rather than crashing the popup.
      alreadySeen = false;
    }
    if (alreadySeen) return;

    timeoutRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, "1");
      } catch {
        // Best-effort -- if storage isn't writable, the popup simply may
        // show again on the next page in this session, which is a mild
        // degradation, not a crash.
      }
      setShuffled(shuffle(items));
      setIndex(0);
      setOpen(true);
    }, OPEN_DELAY_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` is
    // this layout-scoped singleton's server-fetched initial prop; it never
    // changes after mount, and re-running this on identity isn't how
    // "once per session" is meant to behave.
  }, []);

  if (shuffled.length === 0) return null;

  const current = shuffled[index];
  const canGoPrev = index > 0;
  const canGoNext = index < shuffled.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You Might Also Like</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary/10">
            {current.imageUrl ? (
              <Image
                src={current.imageUrl}
                alt={current.name}
                fill
                sizes="(min-width: 640px) 24rem, 100vw"
                className="object-cover"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-semibold">
              {current.name}
            </h3>
            {current.durationLabel ? (
              <p className="text-sm text-muted-foreground">
                {current.durationLabel}
              </p>
            ) : null}
            <div className="flex items-center gap-1.5 pt-1">
              {current.priceOriginal ? (
                <span className="text-xs text-muted-foreground line-through">
                  {current.priceOriginal}
                </span>
              ) : null}
              <span className="text-sm font-semibold">
                {current.priceFinal}
              </span>
            </div>
          </div>

          <Button
            render={<Link href={`/packages/${current.slug}`} />}
            nativeButton={false}
          >
            View Package
          </Button>

          {shuffled.length > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoPrev}
                onClick={() => setIndex((i) => i - 1)}
                aria-label="Previous item"
              >
                <ChevronLeftIcon />
              </Button>
              <span className="text-sm text-muted-foreground">
                {index + 1} / {shuffled.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoNext}
                onClick={() => setIndex((i) => i + 1)}
                aria-label="Next item"
              >
                <ChevronRightIcon />
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire data fetching into the shared public layout**

Replace the full contents of `app/(public)/layout.tsx` with:

```tsx
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import {
  UpsellPopup,
  type UpsellItemDisplay,
} from "@/components/upsell/upsell-popup";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { formatPackagePrice } from "@/lib/packages/format-price";
import {
  buildWhatsAppLink,
  formatWhatsAppNumberForDisplay,
  WHATSAPP_NUMBER,
} from "@/lib/whatsapp";
import { buildMessengerLink } from "@/lib/messenger/link";
import { CONTACT_EMAIL, CONTACT_ADDRESS, INSTAGRAM_URL } from "@/lib/constants";
import type { Database } from "@/types/database";

const FOOTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/packages", label: "Packages" },
  { href: "/contact", label: "Contact Us" },
  { href: "/privacy-policy", label: "Privacy Policy" },
];

// Popup content (upsell_items) is admin-managed and identical for every
// visitor, same as the homepage's hero slides/testimonials -- ISR lets
// this shared layout serve from cache instead of re-querying Supabase on
// every single public-route request. Paired with createPublicClient() (no
// cookies() call) so the route group stays eligible for static rendering.
export const revalidate = 60;

type PackagePhotoRow = Pick<
  Database["public"]["Tables"]["package_photos"]["Row"],
  "storage_path" | "display_order"
>;

type UpsellItemRow = Database["public"]["Tables"]["upsell_items"]["Row"] & {
  packages:
    | (Pick<
        Database["public"]["Tables"]["packages"]["Row"],
        "id" | "slug" | "name" | "duration_label" | "price_per_pax" | "discount_amount"
      > & { package_photos: PackagePhotoRow[] })
    | null;
};

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createPublicClient();

  // upsell_items has unconditional public-read RLS but packages does not,
  // so an item whose linked package has since been unpublished or
  // soft-deleted comes back with `packages: null` under RLS -- filtered
  // out below before render, never rendered broken (same pattern the
  // homepage already uses for package-linked hero slides).
  const { data: rawUpsellItems, error: upsellItemsError } = await supabase
    .from("upsell_items")
    .select(
      "*, packages(id, slug, name, duration_label, price_per_pax, discount_amount, package_photos(storage_path, display_order))"
    )
    .order("created_at", { ascending: true });

  if (upsellItemsError) {
    console.error("Failed to load upsell items:", upsellItemsError.message);
  }

  const upsellItems: UpsellItemDisplay[] = ((rawUpsellItems ?? []) as UpsellItemRow[])
    .map((row) => {
      const pkg = row.packages;
      if (!pkg) return null;

      const [firstPhoto] = [...pkg.package_photos].sort(
        (a, b) => a.display_order - b.display_order
      );
      const price = formatPackagePrice(pkg.price_per_pax, pkg.discount_amount);

      const item: UpsellItemDisplay = {
        id: row.id,
        slug: pkg.slug,
        name: pkg.name,
        imageUrl: firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null,
        durationLabel: pkg.duration_label,
        priceOriginal: price.original,
        priceFinal: price.final,
      };
      return item;
    })
    .filter((item): item is UpsellItemDisplay => item !== null);

  return (
    <>
      {/* Reveal (components/motion/reveal.tsx) and FadeImage/FadeImg
          (components/motion/fade-image.tsx) both start content at
          opacity-0 until client-side JS (an IntersectionObserver, or an
          image load event) confirms it's ready -- that initial hidden
          state is baked into the server-rendered HTML, so a visitor
          without JavaScript would otherwise never see it revealed. This
          forces both visible whenever scripting is off. */}
      <noscript>
        <style>{`.reveal, .fade-image { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to main content
      </a>

      <SiteHeader />

      <main id="main-content" className="flex-1 bg-background">
        {children}
      </main>

      <footer className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <p className="font-heading text-lg font-semibold">
                TravelSentro
              </p>
              <p className="text-sm text-primary-foreground/80">
                Built for Agencies. Ready for Travelers.
              </p>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <p className="font-heading font-semibold">Quick Links</p>
              <nav aria-label="Footer navigation">
                <ul className="flex flex-col gap-2">
                  {FOOTER_LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <p className="font-heading font-semibold">Get in Touch</p>
              <a
                href={`tel:+${WHATSAPP_NUMBER}`}
                className="w-fit text-primary-foreground/80 transition-colors hover:text-primary-foreground"
              >
                {formatWhatsAppNumberForDisplay()}
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="w-fit text-primary-foreground/80 transition-colors hover:text-primary-foreground"
              >
                {CONTACT_EMAIL}
              </a>
              <p className="text-primary-foreground/80">{CONTACT_ADDRESS}</p>
              <div className="flex items-center gap-4 pt-1">
                <a
                  href={buildWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message us on WhatsApp"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 448 512"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                </a>
                <a
                  href={buildMessengerLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message us on Facebook"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.459h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.438-4.92 8.438-9.94Z" />
                  </svg>
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow us on Instagram"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 448 512"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z" />
                  </svg>
                </a>
                <a
                  href={`viber://chat?number=%2B${WHATSAPP_NUMBER}`}
                  aria-label="Message us on Viber"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-primary-foreground/20 pt-6 text-sm text-primary-foreground/70">
            &copy; {new Date().getFullYear()} TravelSentro. All rights
            reserved.
          </div>
        </div>
      </footer>

      <UpsellPopup items={upsellItems} />
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/upsell/upsell-popup.tsx` or `app/(public)/layout.tsx`.

- [ ] **Step 4: Manual QA (still pointed at the local stack; ensure the admin QA from Task 5 left roughly 2 items in the upsell list)**

Run: `npm run dev`.

1. **Zero items:** Remove every upsell item via `/admin/content`. Load any public page in a fresh private window, wait 3+ seconds. Confirm the popup never opens (Review Focus: empty catalog).
2. **One item:** Add exactly one item. Fresh private window, load the homepage. Confirm the popup opens ~1.5s after load, shows that package's name/photo/price, and shows **no** prev/next arrows or counter (Review Focus: single item hides pagination).
3. **Two items:** Add a second item. Fresh private window, load any public page (try one that isn't the homepage, e.g. `/packages`). Confirm the popup opens once, shows a "1 / 2" counter with working Prev/Next (Prev disabled on item 1, Next disabled on item 2), and that the item shown first varies across repeated fresh-window loads (shuffled order).
4. **No re-trigger:** In the same tab/session, after the popup has shown once, click an in-app `<Link>` to another public page. Confirm the popup does **not** reopen. Close the browser tab, open a brand-new one (new session) — confirm it opens again.
5. **Unpublished package:** Via `/admin/packages`, unpublish one of the two packages currently in the upsell list. Fresh private window, load the homepage. Confirm the popup either shows just the remaining item (arrows/counter now hidden again) or doesn't render if that was the only item — no crash, no broken image (Review Focus: excluded unpublished package).
6. Click **View Package** on the popup and confirm it navigates to the correct `/packages/[slug]` page.

- [ ] **Step 5: Commit**

```bash
git add components/upsell/upsell-popup.tsx "app/(public)/layout.tsx"
git commit -m "feat: add public upsell popup"
```
