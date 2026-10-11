# Partners Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the homepage's Brand Partners and Corporate Clients logos from repo folders into an admin-managed Partners module, with an optional website link per logo that visitors can click.

**Architecture:** The existing (currently unread) `partners` table is extended with `name` and `is_published` and becomes the single source for both groups, discriminated by `partner_type`. A new `/admin/partners` page (two tabs, one shared list component) writes to it through `actions/partners.ts`; the homepage reads published rows and wraps linked logos in an anchor. Link validation lives in one pure helper used by the form, the server action, and mirrored by a database check constraint.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres + RLS, Cloudflare R2 (`lib/storage/r2-client.ts`), react-hook-form + zod 4, shadcn/ui on Base UI, dnd-kit, `tsx` verify scripts.

**Spec:** `docs/superpowers/specs/2026-10-11-partners-module-design.md`

## Global Constraints

- Only **Brand Partners** and **Corporate Clients** move to the database. **Airlines** and **Travel Partners** keep reading from `public/logos/airlines` and `public/logos/operators`; `components/homepage/logo-marquee.tsx` is not modified.
- Permission is the existing `can_manage_packages` — no new permission column, toggle, or nav prop.
- `partner_type` values are exactly `brand_partner` and `corporate_client`.
- The link is optional. A stored link always starts with `http://` or `https://` (form, server action, and database constraint all enforce it). A link typed without a scheme gets `https://` prepended.
- Public links open in a new tab: `target="_blank" rel="noopener noreferrer"`.
- Accepted logo types: SVG, PNG, JPG, WebP. Logos are stored in R2 under the `partners/` prefix.
- Section headings, layout, and the "coming soon" placeholders on the homepage do not change.
- Do not touch `voucher_partners` or anything in the Vouchers module.
- No new npm dependencies.
- Next.js 16 has breaking changes versus older versions. Before using any Next API not already used in a neighbouring file, read its guide under `node_modules/next/dist/docs/01-app/` (e.g. `03-api-reference/02-components/image.md` for `next/image`).
- Tests in this repo are `scripts/verify-*.ts` run with `tsx`, each registered as an `npm run verify:*` script, printing PASS/FAIL per check and exiting 1 on any failure. Scripts import with relative paths (`../lib/...`), never the `@/` alias.
- **Never `git push`.** Pushing `staging` or `master` applies migrations and deploys. Rollout is two pushes done by the user (see "Rollout handoff" at the end).

## Local Environment Notes (read before Task 1)

- `.env.local` points at a **remote** Supabase project. New migrations are applied to the **local** stack only. Point live scripts and the test dev server at the local stack by exporting env vars first (Node's `--env-file` and Next never override variables already set):
  ```bash
  eval "$(npx supabase status -o env | sed -n 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
  export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
  ```
  Run that once per shell before any live command in this plan. If `npx supabase status -o env` prints different key names, map them by hand from `npx supabase status`.
- If `npx supabase start` fails on ports 54321–54327, another project's stack may hold them: `docker ps --format '{{.Names}}\t{{.Ports}}'`. Ask the user before stopping someone else's containers.
- The user usually has `next dev` running on port 3000 in this checkout, pointed at the remote project. Do not stop it. Next 16 refuses a second dev server in the same directory, so browser checks run from a scratch copy on port 3100 (Task 6 gives the commands).
- While this work is uncommitted-to-remote, the user's own port-3000 server will log "Failed to load partners" after Task 7 and show the two placeholders, because the remote database does not have the new columns until the migration is pushed. That is expected.
- R2 has no local stand-in: uploads made during testing go to whichever bucket `.env.local` names. Check `R2_BUCKET_NAME` before the browser pass; if it is the production bucket, tell the user before uploading test logos.

## Review Focus

1. **Links typed loosely or maliciously** — `paynamics.com`, `example.com:8080/x`, `javascript:alert(1)`, `mailto:a@b.com`, `localhost:3000`, a string with a space. Expected: bare domains get `https://`, everything that is not a real web address is rejected, and nothing but `http(s)` can ever reach an `href`. Pinned by Task 1's link checks and Task 2's constraint check.
2. **Wrong file chosen as a logo** — a PDF, a HEIC photo, or a 9 MB PNG. Expected: a clear toast, nothing uploaded, no generic failure. Guarded in Task 4's form; checked by hand in Task 6. An SVG must be stored with a `.svg` key or `next/image` rejects it — pinned by Task 1's extension checks.
3. **Rows that should not be public** — a hidden partner, or a stale row left in `partners` from before the folder switch. Expected: neither is returned to an anonymous visitor. Pinned by Task 2's anon-read check and its legacy-row check.
4. **Ordering across the two tabs** — adding after a delete, or reordering one tab. Expected: the new entry lands last in its own tab and the other tab's order is untouched. `createPartner` uses max+1 per type (not a row count); checked by hand in Task 6.
5. **Staff without `can_manage_packages`** — opening `/admin/partners` directly or calling the actions. Expected: redirect to `/admin/forbidden`, no nav item, actions throw, RLS rejects the write. Pinned by Task 2's anon-insert check and Task 6's role flip.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/partners/partner-type.ts` | The two partner types, a type guard, and their display labels |
| `lib/partners/link.ts` | Pure: normalize and validate a website link |
| `lib/storage/image-extension.ts` | Pure: MIME type → file extension (moved out of the upload action) |
| `scripts/verify-partner-helpers.ts` | PASS/FAIL checks for the two pure helpers |
| `supabase/migrations/20261011120000_partners_module.sql` | `name`, `is_published`, link constraint, published-only public read |
| `scripts/verify-partners-rls.ts` | Live checks: anon read/insert, link and name constraints |
| `types/database.ts` | `partners` Row/Insert/Update gain `name`, `is_published` |
| `actions/site-content-uploads.ts` | Adds the `partners` folder; uses the shared extension helper |
| `components/admin/partners/partner-form-schema.ts` | zod schema for the add/edit form |
| `actions/partners.ts` | create / update / toggle / delete / reorder Server Actions |
| `components/admin/partners/partner-form.tsx` | Add/edit form with logo upload |
| `components/admin/partners/partners-list.tsx` | One tab's list: add, edit, reorder, show/hide, delete |
| `app/admin/(dashboard)/partners/page.tsx` | Gated page, loads rows, two tabs |
| `app/admin/(dashboard)/partners/loading.tsx` | Skeleton |
| `components/admin/admin-nav.tsx` | "Partners" sidebar item |
| `scripts/seed-partner-logos.ts` + `supabase/seed-assets/partner-logos/**` | One-off, re-runnable seed of the 4 existing logos |
| `components/homepage/partner-logo.tsx` | One logo, wrapped in a link when it has one |
| `lib/logos/read-logo-folder.ts` | `LogoFile` gains optional `href` |
| `components/homepage/partner-affiliations.tsx`, `components/homepage/corporate-clients.tsx` | Render `PartnerLogo` |
| `app/(public)/page.tsx` | Queries `partners` instead of reading the two folders |

---

### Task 1: Pure helpers — partner types, link normalizing, image extension

**Files:**
- Create: `lib/partners/partner-type.ts`
- Create: `lib/partners/link.ts`
- Create: `lib/storage/image-extension.ts`
- Create: `scripts/verify-partner-helpers.ts`
- Modify: `actions/site-content-uploads.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `PARTNER_TYPES: readonly ["brand_partner", "corporate_client"]`, `type PartnerType`, `isPartnerType(value: unknown): value is PartnerType`, `PARTNER_TYPE_LABELS: Record<PartnerType, { singular: string; plural: string; placement: string }>`
  - `normalizePartnerLink(input: string): { ok: true; url: string | null } | { ok: false }`
  - `extensionFromMimeType(type: string): string`
  - `uploadSiteContentImage("partners", file)` becomes a valid call

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-partner-helpers.ts`:

```ts
/**
 * Pure-logic proof for lib/partners/link.ts's normalizePartnerLink and
 * lib/storage/image-extension.ts's extensionFromMimeType -- mirrors
 * scripts/verify-format-price.ts's CheckResult/PASS-FAIL structure. No
 * network/Supabase access needed.
 *
 * Run via `npm run verify:partner-helpers`.
 */
import { normalizePartnerLink } from "../lib/partners/link";
import { extensionFromMimeType } from "../lib/storage/image-extension";

type CheckResult = { name: string; pass: boolean; detail: string };

// `expected` is the stored URL, null for "valid and blank", or "INVALID".
const LINK_CASES: ReadonlyArray<{ input: string; expected: string | null }> = [
  { input: "", expected: null },
  { input: "   ", expected: null },
  { input: "paynamics.com", expected: "https://paynamics.com" },
  { input: "  paynamics.com  ", expected: "https://paynamics.com" },
  { input: "https://paynamics.com", expected: "https://paynamics.com" },
  { input: "https://paynamics.com/", expected: "https://paynamics.com/" },
  { input: "http://example.com/about?ref=ts", expected: "http://example.com/about?ref=ts" },
  { input: "HTTPS://Example.COM/Path", expected: "https://example.com/Path" },
  { input: "www.example.com/partners", expected: "https://www.example.com/partners" },
  { input: "example.com:8080/x", expected: "https://example.com:8080/x" },
  { input: "javascript:alert(1)", expected: "INVALID" },
  { input: "JavaScript:alert(1)", expected: "INVALID" },
  { input: "data:text/html,<script>alert(1)</script>", expected: "INVALID" },
  { input: "mailto:hello@example.com", expected: "INVALID" },
  { input: "ftp://example.com", expected: "INVALID" },
  { input: "localhost:3000", expected: "INVALID" },
  { input: "example", expected: "INVALID" },
  { input: "my site.com", expected: "INVALID" },
  { input: "https://", expected: "INVALID" },
  { input: `https://example.com/${"a".repeat(2100)}`, expected: "INVALID" },
];

function checkLink(input: string, expected: string | null): CheckResult {
  const result = normalizePartnerLink(input);
  const actual = result.ok ? result.url : "INVALID";
  const shown = input.length > 40 ? `${input.slice(0, 40)}...` : input;
  return {
    name: `normalizePartnerLink(${JSON.stringify(shown)})`,
    pass: actual === expected,
    detail: `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  };
}

const EXTENSION_CASES: ReadonlyArray<{ type: string; expected: string }> = [
  { type: "image/svg+xml", expected: "svg" },
  { type: "image/jpeg", expected: "jpg" },
  { type: "image/png", expected: "png" },
  { type: "image/webp", expected: "webp" },
  { type: "", expected: "jpg" },
];

function checkExtension(type: string, expected: string): CheckResult {
  const actual = extensionFromMimeType(type);
  return {
    name: `extensionFromMimeType(${JSON.stringify(type)})`,
    pass: actual === expected,
    detail: `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  };
}

function main() {
  const results = [
    ...LINK_CASES.map((c) => checkLink(c.input, c.expected)),
    ...EXTENSION_CASES.map((c) => checkExtension(c.type, c.expected)),
  ];

  console.log(`\nverify-partner-helpers\n`);
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

Add to `package.json` `scripts`, after `"verify:quote-values"`:

```json
    "verify:partner-helpers": "tsx scripts/verify-partner-helpers.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run verify:partner-helpers`
Expected: FAIL — `Cannot find module '../lib/partners/link'`.

- [ ] **Step 3: Write the helpers**

Create `lib/partners/partner-type.ts`:

```ts
/**
 * The two groups the Partners admin module manages. Values match the
 * `partners.partner_type` check constraint in
 * supabase/migrations/20260727075208_create_homepage_content_schema.sql.
 */
export const PARTNER_TYPES = ["brand_partner", "corporate_client"] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

export function isPartnerType(value: unknown): value is PartnerType {
  return PARTNER_TYPES.includes(value as PartnerType);
}

export const PARTNER_TYPE_LABELS: Record<
  PartnerType,
  { singular: string; plural: string; placement: string }
> = {
  brand_partner: {
    singular: "Brand Partner",
    plural: "Brand Partners",
    placement: "under Brand Partners in the Partner Affiliations section",
  },
  corporate_client: {
    singular: "Corporate Client",
    plural: "Corporate Clients",
    placement: "in the Corporate Clients section",
  },
};
```

Create `lib/partners/link.ts`:

```ts
export type PartnerLinkResult =
  | { ok: true; url: string | null }
  | { ok: false };

const MAX_LINK_LENGTH = 2048;
const WEB_SCHEME = /^https?:\/\//i;
// A leading "word:" that is a scheme (javascript:, mailto:, ftp:) rather
// than a host:port pair such as "example.com:8080".
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i;

/**
 * Normalizes a partner's website link for storage. Pure and client-safe:
 * the admin form uses it for validation and actions/partners.ts re-runs it
 * server-side, so the rule lives once.
 *
 * A blank input is valid and means "no link". A link typed without a
 * scheme gets https:// prepended. Anything that isn't an http(s) address
 * with a dotted hostname is rejected -- the result is rendered as an href
 * on the public homepage, so a javascript: URL must never get through.
 */
export function normalizePartnerLink(input: string): PartnerLinkResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, url: null };
  if (trimmed.length > MAX_LINK_LENGTH) return { ok: false };

  let candidate = trimmed;
  if (!WEB_SCHEME.test(trimmed)) {
    if (OTHER_SCHEME.test(trimmed)) return { ok: false };
    candidate = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false };
  }
  if (!parsed.hostname.includes(".")) return { ok: false };

  // URL#href always adds a trailing slash to a bare origin; drop it unless
  // the admin typed one, so "paynamics.com" is stored as typed plus scheme.
  const isBareOrigin =
    parsed.pathname === "/" &&
    !parsed.search &&
    !parsed.hash &&
    !candidate.endsWith("/");

  return { ok: true, url: isBareOrigin ? parsed.href.slice(0, -1) : parsed.href };
}
```

Create `lib/storage/image-extension.ts`:

```ts
/**
 * File extension for an uploaded image's MIME type. The "+xml" suffix is
 * dropped so image/svg+xml yields "svg" -- next/image only skips its
 * optimizer (which rejects SVGs) when the src ends in ".svg".
 */
export function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1]?.split("+")[0];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run verify:partner-helpers`
Expected: `PASS: 25/25 checks passed`.

- [ ] **Step 5: Use the shared helper in the upload action and allow the `partners` folder**

In `actions/site-content-uploads.ts`:

Add the import after the `r2-client` import:

```ts
import { extensionFromMimeType } from "@/lib/storage/image-extension";
```

Replace the folder list:

```ts
const ALLOWED_FOLDERS = [
  "hero-slides",
  "testimonials",
  "destinations",
  "visa-services",
  "partners",
] as const;
```

Delete the local helper (the whole function):

```ts
function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/partners lib/storage/image-extension.ts scripts/verify-partner-helpers.ts actions/site-content-uploads.ts package.json
git commit -m "feat: partner link and image extension helpers"
```

---

### Task 2: Migration, RLS proof, and types

**Files:**
- Create: `scripts/verify-partners-rls.ts`
- Create: `supabase/migrations/20261011120000_partners_module.sql`
- Modify: `types/database.ts` (the `partners` block)
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `partners` columns `name text not null`, `is_published boolean not null default true`; `Database["public"]["Tables"]["partners"]["Row"]` includes `name: string` and `is_published: boolean`.

- [ ] **Step 1: Start the local stack and point the shell at it**

```bash
npx supabase start
eval "$(npx supabase status -o env | sed -n 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
echo "$NEXT_PUBLIC_SUPABASE_URL"
```

Expected: the last line prints `http://127.0.0.1:54321`. If `supabase start` fails on a port, see Local Environment Notes.

- [ ] **Step 2: Write the failing live verify script**

Create `scripts/verify-partners-rls.ts`:

```ts
/**
 * Proves the partners table behaves as the Partners module needs, against
 * a real database -- not just that the migration SQL parses:
 * anonymous visitors read published rows only and cannot write, and the
 * database itself rejects a non-web link or a blank name. Mirrors
 * scripts/verify-upsell-rls.ts's CheckResult/PASS-FAIL structure.
 *
 * Run via `npm run verify:partners-rls` with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY pointed at a
 * project that has 20261011120000_partners_module.sql applied (the local
 * stack, until it's pushed elsewhere). It inserts and then deletes its own
 * rows, all named with a unique prefix.
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
      "Point these at a project with the partners module migration applied, then run " +
      "`npm run verify:partners-rls`."
  );
}

/**
 * Node 20 has no native global WebSocket; @supabase/supabase-js always
 * constructs a RealtimeClient, which requires one. Mirrors
 * scripts/verify-upsell-rls.ts's identical polyfill.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;

const PREFIX = `__verify_partners_${Date.now()}`;
const VISIBLE_NAME = `${PREFIX} visible`;
const HIDDEN_NAME = `${PREFIX} hidden`;

async function checkAnonSeesPublishedOnly(anon: Client): Promise<CheckResult> {
  const { data, error } = await anon
    .from("partners")
    .select("name")
    .like("name", `${PREFIX}%`);
  const names = (data ?? []).map((row) => row.name).sort();
  const pass = !error && names.length === 1 && names[0] === VISIBLE_NAME;
  return {
    name: "Anonymous SELECT returns the published row and not the hidden one",
    pass,
    detail: error ? `error: ${error.message}` : `rows=${JSON.stringify(names)}`,
  };
}

async function checkAnonInsertRejected(anon: Client): Promise<CheckResult> {
  const { error } = await anon.from("partners").insert({
    partner_type: "brand_partner",
    name: `${PREFIX} anon`,
    logo_storage_path: "partners/verify-anon.svg",
  });
  return {
    name: "Anonymous INSERT is rejected by RLS",
    pass: error !== null,
    detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function checkNonWebLinkRejected(service: Client): Promise<CheckResult> {
  const { error } = await service.from("partners").insert({
    partner_type: "brand_partner",
    name: `${PREFIX} bad link`,
    logo_storage_path: "partners/verify-bad-link.svg",
    link_url: "javascript:alert(1)",
  });
  const pass = error?.code === "23514";
  return {
    name: "A javascript: link is rejected by the partners_link_url_http constraint",
    pass,
    detail: error ? `code=${error.code} ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function checkBlankNameRejected(service: Client): Promise<CheckResult> {
  const { error } = await service.from("partners").insert({
    partner_type: "corporate_client",
    name: "   ",
    logo_storage_path: `partners/${PREFIX}-blank.svg`,
  });
  const pass = error?.code === "23514";
  // If the insert got through, remove it by its unique storage path (its
  // blank name wouldn't match the prefix cleanup in main()).
  if (!error) {
    await service
      .from("partners")
      .delete()
      .eq("logo_storage_path", `partners/${PREFIX}-blank.svg`);
  }
  return {
    name: "A blank name is rejected by the partners_name_not_blank constraint",
    pass,
    detail: error ? `code=${error.code} ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function main() {
  await ensureWebSocketPolyfill();
  console.log(`\nverify-partners-rls -> ${new URL(SUPABASE_URL!).host}\n`);

  const options = { auth: { persistSession: false } };
  const anon = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, options);
  const service = createClient<Database>(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
    options
  );

  const results: CheckResult[] = [];
  try {
    const { error: seedError } = await service.from("partners").insert([
      {
        partner_type: "brand_partner",
        name: VISIBLE_NAME,
        logo_storage_path: "partners/verify-visible.svg",
        link_url: "https://example.com",
        is_published: true,
      },
      {
        partner_type: "corporate_client",
        name: HIDDEN_NAME,
        logo_storage_path: "partners/verify-hidden.svg",
        is_published: false,
      },
    ]);
    if (seedError) {
      throw new Error(`could not insert fixture rows: ${seedError.message}`);
    }

    results.push(await checkAnonSeesPublishedOnly(anon));
    results.push(await checkAnonInsertRejected(anon));
    results.push(await checkNonWebLinkRejected(service));
    results.push(await checkBlankNameRejected(service));
  } finally {
    await service.from("partners").delete().like("name", `${PREFIX}%`);
  }

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
  console.error("verify-partners-rls failed:", err);
  process.exit(1);
});
```

Add to `package.json` `scripts`, after `"verify:partner-helpers"`:

```json
    "verify:partners-rls": "tsx --env-file=.env.local scripts/verify-partners-rls.ts",
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run verify:partners-rls`
Expected: the first line shows host `127.0.0.1:54321`, then it exits 1 with `could not insert fixture rows: Could not find the 'is_published' column of 'partners'` (or the same message naming `name`).

- [ ] **Step 4: Insert a legacy row, so the migration's handling of old rows is exercised**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "insert into partners (partner_type, logo_storage_path, link_url) values ('brand_partner', 'legacy/old-logo.png', 'not-a-web-link');"
```

Expected: `INSERT 0 1`. (If `psql` is not installed, run the same SQL in Supabase Studio at `http://127.0.0.1:54323` → SQL Editor.)

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/20261011120000_partners_module.sql`:

```sql
-- Partners module -- makes the existing `partners` table
-- (20260727075208_create_homepage_content_schema.sql) the admin-managed
-- source for the homepage's Brand Partners and Corporate Clients logos,
-- replacing the public/logos/brand-partners and "corporate partners"
-- folders. Adds a display name, a published flag (public read becomes
-- published-only, mirroring visa_services), and a database-level guarantee
-- that a stored link is always an http(s) URL -- it is rendered as an href
-- on the public homepage.
--
-- The four can_manage_packages-gated authenticated policies are unchanged.

alter table partners
  add column name text,
  add column is_published boolean not null default true;

-- Rows may survive from before the homepage switched to folder-based
-- logos. They get a placeholder name and are hidden rather than deleted,
-- so nothing stale appears on the homepage and staff can review them in
-- the admin.
update partners set name = 'Untitled partner', is_published = false;

-- A pre-existing link that fails the new check below would abort the
-- migration, so clear any first.
update partners set link_url = null
  where link_url is not null and link_url !~* '^https?://';

alter table partners
  alter column name set not null,
  add constraint partners_name_not_blank check (length(trim(name)) > 0),
  add constraint partners_link_url_http check (
    link_url is null or link_url ~* '^https?://'
  );

drop policy "public read" on partners;

create policy "public read" on partners
  for select using (is_published = true);

create index partners_type_sort_idx on partners (partner_type, sort_order);
```

- [ ] **Step 6: Apply it to the local stack and check the legacy row**

```bash
npx supabase migration up
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select name, is_published, link_url from partners where logo_storage_path = 'legacy/old-logo.png';"
```

Expected: the migration applies without error, and the query returns one row: `Untitled partner | f | ` (link is null). Then remove it:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "delete from partners where logo_storage_path = 'legacy/old-logo.png';"
```

- [ ] **Step 7: Run the verify script to verify it passes**

Run: `npm run verify:partners-rls`
Expected: `PASS: 4/4 checks passed`.

If it still reports that the `name` or `is_published` column cannot be found, the local API's schema cache is stale — reload it and re-run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "notify pgrst, 'reload schema';"
```

- [ ] **Step 8: Update the types**

In `types/database.ts`, replace the whole `partners` block with:

```ts
      partners: {
        Row: {
          created_at: string;
          id: string;
          is_published: boolean;
          link_url: string | null;
          logo_storage_path: string;
          name: string;
          partner_type: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_published?: boolean;
          link_url?: string | null;
          logo_storage_path: string;
          name: string;
          partner_type: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_published?: boolean;
          link_url?: string | null;
          logo_storage_path?: string;
          name?: string;
          partner_type?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
```

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20261011120000_partners_module.sql scripts/verify-partners-rls.ts types/database.ts package.json
git commit -m "feat: partners table name, published flag and link constraint"
```

---

### Task 3: Form schema and Server Actions

**Files:**
- Create: `components/admin/partners/partner-form-schema.ts`
- Create: `actions/partners.ts`

**Interfaces:**
- Consumes: `normalizePartnerLink`, `isPartnerType`, `PartnerType` (Task 1); `partners.name` / `is_published` types (Task 2); `requirePermission` from `@/lib/auth/dal`; `ActionResult` from `@/lib/action-result`.
- Produces:
  - `partnerFormSchema`, `type PartnerFormValues = { name: string; logoStoragePath: string; linkUrl?: string; isPublished: boolean }`
  - `createPartner(partnerType: PartnerType, values: PartnerFormValues): Promise<ActionResult>`
  - `updatePartner(id: string, values: PartnerFormValues): Promise<ActionResult>`
  - `togglePartnerPublished(id: string, isPublished: boolean): Promise<ActionResult>`
  - `deletePartner(id: string): Promise<ActionResult>`
  - `reorderPartners(order: { id: string; sortOrder: number }[]): Promise<ActionResult>`

- [ ] **Step 1: Write the form schema**

Create `components/admin/partners/partner-form-schema.ts`:

```ts
import { z } from "zod";

import { normalizePartnerLink } from "@/lib/partners/link";

export const partnerFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter a name"),
  logoStoragePath: z.string().min(1, "Please upload a logo"),
  linkUrl: z
    .string()
    .optional()
    .refine((value) => normalizePartnerLink(value ?? "").ok, {
      message: "Enter a valid website address, e.g. https://example.com",
    }),
  isPublished: z.boolean(),
});

export type PartnerFormValues = z.infer<typeof partnerFormSchema>;
```

- [ ] **Step 2: Write the Server Actions**

Create `actions/partners.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { normalizePartnerLink } from "@/lib/partners/link";
import { isPartnerType, type PartnerType } from "@/lib/partners/partner-type";
import {
  partnerFormSchema,
  type PartnerFormValues,
} from "@/components/admin/partners/partner-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

function revalidatePartnerPaths() {
  revalidatePath("/");
  revalidatePath("/admin/partners");
}

/**
 * Server Action arguments aren't runtime-type-checked at the network
 * boundary, so the form values are re-validated here rather than trusted:
 * link_url ends up as an href on the public homepage and must be an
 * http(s) URL, and the logo key must stay inside the partners/ R2 folder.
 * Returns null when the values don't pass.
 */
function toColumns(values: unknown) {
  const parsed = partnerFormSchema.safeParse(values);
  if (!parsed.success) return null;

  const link = normalizePartnerLink(parsed.data.linkUrl ?? "");
  if (!link.ok) return null;
  if (!parsed.data.logoStoragePath.startsWith("partners/")) return null;

  return {
    name: parsed.data.name,
    logo_storage_path: parsed.data.logoStoragePath,
    link_url: link.url,
    is_published: parsed.data.isPublished,
  };
}

/**
 * Creates a partner at the end of its own group's order. Uses the group's
 * highest sort_order + 1 rather than a row count, so adding after a delete
 * can't collide with an existing position.
 */
export async function createPartner(
  partnerType: PartnerType,
  values: PartnerFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const columns = toColumns(values);
  if (!isPartnerType(partnerType) || !columns) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: last, error: lastError } = await supabase
    .from("partners")
    .select("sort_order")
    .eq("partner_type", partnerType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const { error: createError } = await supabase.from("partners").insert({
    ...columns,
    partner_type: partnerType,
    sort_order: last ? last.sort_order + 1 : 0,
  });

  if (createError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}

export async function updatePartner(
  id: string,
  values: PartnerFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const columns = toColumns(values);
  if (!columns) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("partners")
    .update(columns)
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}

export async function togglePartnerPublished(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  if (typeof isPublished !== "boolean") {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("partners")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}

export async function deletePartner(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("partners")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}

/** Persists a client-computed drag order for one group (mirrors reorderFaqs). */
export async function reorderPartners(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const isValidOrder =
    Array.isArray(order) &&
    order.every(
      (item) =>
        typeof item?.id === "string" && Number.isInteger(item?.sortOrder)
    );
  if (!isValidOrder) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("partners")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/partners/partner-form-schema.ts actions/partners.ts
git commit -m "feat: partner server actions"
```

---

### Task 4: Admin UI — form, list, page, nav item

**Files:**
- Create: `components/admin/partners/partner-form.tsx`
- Create: `components/admin/partners/partners-list.tsx`
- Create: `app/admin/(dashboard)/partners/page.tsx`
- Create: `app/admin/(dashboard)/partners/loading.tsx`
- Modify: `components/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: everything Task 3 produces; `uploadSiteContentImage("partners", { name, type, base64 })` → `ActionResult & { storagePath?: string }` (Task 1); `PARTNER_TYPE_LABELS`, `PartnerType` (Task 1); `getPublicImageUrl(key: string): string`; `readFileAsBase64(file: Blob): Promise<string>`.
- Produces: `type PartnerRecord = { id: string; name: string; logoStoragePath: string; linkUrl: string | null; isPublished: boolean }`; `PartnerForm`; `PartnersList({ partnerType, initialItems })`; route `/admin/partners`.

- [ ] **Step 1: Write the form**

Create `components/admin/partners/partner-form.tsx`:

```tsx
"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createPartner, updatePartner } from "@/actions/partners";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import {
  PARTNER_TYPE_LABELS,
  type PartnerType,
} from "@/lib/partners/partner-type";
import {
  partnerFormSchema,
  type PartnerFormValues,
} from "./partner-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const ACCEPTED_LOGO_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
];
// Logos are small; this also keeps the base64 payload well under the 10mb
// Server Action body limit set in next.config.ts.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type PartnerRecord = {
  id: string;
  name: string;
  logoStoragePath: string;
  linkUrl: string | null;
  isPublished: boolean;
};

/**
 * Add/edit form for one partner. `partner` is absent when adding. The
 * group (brand partner vs corporate client) comes from the tab the form
 * was opened in -- it is not a field the user can change.
 */
export function PartnerForm({
  partnerType,
  partner,
  onSuccess,
}: {
  partnerType: PartnerType;
  partner?: PartnerRecord;
  onSuccess: () => void;
}) {
  const labels = PARTNER_TYPE_LABELS[partnerType];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues: {
      name: partner?.name ?? "",
      logoStoragePath: partner?.logoStoragePath ?? "",
      linkUrl: partner?.linkUrl ?? "",
      isPublished: partner?.isPublished ?? true,
    },
  });

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    // The file picker's `accept` filter can be bypassed ("All files"), so
    // the type and size are checked here before anything is uploaded.
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error("Logo must be an SVG, PNG, JPG or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("partners", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
        toast.success("Logo uploaded.");
      } else {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(values: PartnerFormValues) {
    setIsSubmitting(true);
    try {
      const result = partner
        ? await updatePartner(partner.id, values)
        : await createPartner(partnerType, values);

      if (result.ok) {
        toast.success(
          partner
            ? `${labels.singular} updated.`
            : `${labels.singular} added.`
        );
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

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="e.g. Paynamics" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="logoStoragePath"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo</FormLabel>
              {field.value ? (
                <div className="flex items-center gap-3">
                  {/* Plain <img> -- admin thumbnail, mirrors
                      visa-service-form.tsx. White tile + object-contain so
                      a transparent logo stays legible and uncropped. */}
                  <img
                    src={getPublicImageUrl(field.value)}
                    alt=""
                    className="h-16 w-32 rounded-md bg-white object-contain p-2 ring-1 ring-foreground/10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field.onChange("")}
                  >
                    Remove logo
                  </Button>
                </div>
              ) : null}
              <FormControl>
                <input
                  type="file"
                  accept={ACCEPTED_LOGO_TYPES.join(",")}
                  disabled={isUploadingImage}
                  onChange={(event) =>
                    handleImageChange(event, (storagePath) =>
                      field.onChange(storagePath)
                    )
                  }
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
              </FormControl>
              <FormDescription>SVG, PNG, JPG or WebP, up to 2 MB.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="linkUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website link (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com"
                />
              </FormControl>
              <FormDescription>
                Visitors who click the logo are taken here. Leave blank for a
                logo that isn&apos;t clickable.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isPublished"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
              <FormLabel className="cursor-pointer">
                Show on the homepage
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

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isUploadingImage}
          className="self-end"
        >
          {isSubmitting
            ? "Saving..."
            : partner
              ? "Save Changes"
              : `Add ${labels.singular}`}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Write the list**

Create `components/admin/partners/partners-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";

import {
  deletePartner,
  reorderPartners,
  togglePartnerPublished,
} from "@/actions/partners";
import { PartnerForm, type PartnerRecord } from "./partner-form";
import {
  PARTNER_TYPE_LABELS,
  type PartnerType,
} from "@/lib/partners/partner-type";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * One group's partner manager (Brand Partners or Corporate Clients) --
 * same composition as content/visa-services-list.tsx: Dialog-wrapped
 * add/edit form, dnd-kit drag-reorder, per-row optimistic visibility
 * Switch and AlertDialog-confirmed delete. Rendered once per tab on
 * /admin/partners; each instance only ever sees its own group's rows.
 */
export function PartnersList({
  partnerType,
  initialItems,
}: {
  partnerType: PartnerType;
  initialItems: PartnerRecord[];
}) {
  const labels = PARTNER_TYPE_LABELS[partnerType];
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  // Adjusts `items` when fresh props arrive after router.refresh() (see
  // content/faqs-list.tsx for the rationale).
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PartnerRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<PartnerRecord | null>(null);
  const [isDeleting, startDeleting] = useTransition();
  const [, startReordering] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingItem(null);
    router.refresh();
  }

  function handlePublishedChange(id: string, isPublished: boolean) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isPublished } : item))
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    const previousItems = items;
    setItems(reordered);

    startReordering(async () => {
      try {
        const result = await reorderPartners(
          reordered.map((item, index) => ({ id: item.id, sortOrder: index }))
        );
        if (!result.ok) {
          toast.error(result.error);
          setItems(previousItems);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setItems(previousItems);
      }
    });
  }

  function handleDelete() {
    if (!deletingItem) return;
    const target = deletingItem;

    startDeleting(async () => {
      try {
        const result = await deletePartner(target.id);
        if (result.ok) {
          toast.success(`${labels.singular} deleted.`);
          setItems((current) =>
            current.filter((item) => item.id !== target.id)
          );
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Shown on the homepage {labels.placement}, in this order. Drag to
          reorder; hidden logos stay saved here. A logo with a website link
          opens that site in a new tab when clicked.
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" className="shrink-0" />}>
            Add {labels.singular}
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add {labels.singular}</DialogTitle>
            </DialogHeader>
            <PartnerForm
              partnerType={partnerType}
              onSuccess={handleMutationSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No {labels.plural.toLowerCase()} yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a logo and, if you like, the website it should link to. The
            homepage shows a &ldquo;coming soon&rdquo; note until the first
            one is visible.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <PartnerRow
                  key={item.id}
                  item={item}
                  onEdit={() => setEditingItem(item)}
                  onDelete={() => setDeletingItem(item)}
                  onPublishedChange={handlePublishedChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {labels.singular}</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <PartnerForm
              key={editingItem.id}
              partnerType={partnerType}
              partner={editingItem}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this {labels.singular.toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deletingItem?.name}&rdquo; will be removed from the
              homepage immediately. To keep it for later, hide it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : `Delete ${labels.singular}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PartnerRow({
  item,
  onEdit,
  onDelete,
  onPublishedChange,
}: {
  item: PartnerRecord;
  onEdit: () => void;
  onDelete: () => void;
  onPublishedChange: (id: string, isPublished: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  function handlePublishedChange(checked: boolean) {
    onPublishedChange(item.id, checked);
    startTransition(async () => {
      try {
        const result = await togglePartnerPublished(item.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          onPublishedChange(item.id, !checked);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        onPublishedChange(item.id, !checked);
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="-my-2 flex size-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
                {...attributes}
                {...listeners}
              />
            }
          >
            <GripVerticalIcon />
            <span className="sr-only">Drag to reorder</span>
          </TooltipTrigger>
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>

        {/* Plain <img> -- admin thumbnail, mirrors visa-services-list.tsx.
            White tile + object-contain so a transparent logo stays
            legible and uncropped. */}
        <img
          src={getPublicImageUrl(item.logoStoragePath)}
          alt=""
          className="h-14 w-28 shrink-0 rounded-md bg-white object-contain p-2 ring-1 ring-foreground/10"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.name}</p>
            {!item.isPublished && <Badge variant="outline">Hidden</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {item.linkUrl ?? "No link"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-13 sm:pl-0">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={item.isPublished}
            onCheckedChange={handlePublishedChange}
            disabled={isPending}
          />
          Visible
        </label>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page and its loading skeleton**

Create `app/admin/(dashboard)/partners/page.tsx`:

```tsx
import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { PartnersList } from "@/components/admin/partners/partners-list";
import type { PartnerRecord } from "@/components/admin/partners/partner-form";
import {
  PARTNER_TYPE_LABELS,
  type PartnerType,
} from "@/lib/partners/partner-type";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export const metadata: Metadata = {
  title: "Partners | TravelSentro Admin",
};

export default async function AdminPartnersPage() {
  // AUTH-05 -- gate independent of nav hiding; RLS is the second,
  // independent enforcement layer (mirrors every other admin page). Reuses
  // can_manage_packages, the same permission that gates /admin/content.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("partners")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load partners:", error.message);
  }

  function recordsOf(partnerType: PartnerType): PartnerRecord[] {
    return (rows ?? [])
      .filter((row) => row.partner_type === partnerType)
      .map((row) => ({
        id: row.id,
        name: row.name,
        logoStoragePath: row.logo_storage_path,
        linkUrl: row.link_url,
        isPublished: row.is_published,
      }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Partners"
        description="Manage the Brand Partners and Corporate Clients logos shown on the homepage, and where each one links."
      />

      <Tabs defaultValue="brand_partner">
        <TabsList>
          <TabsTrigger value="brand_partner">
            {PARTNER_TYPE_LABELS.brand_partner.plural}
          </TabsTrigger>
          <TabsTrigger value="corporate_client">
            {PARTNER_TYPE_LABELS.corporate_client.plural}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand_partner" keepMounted className="pt-4">
          <PartnersList
            partnerType="brand_partner"
            initialItems={recordsOf("brand_partner")}
          />
        </TabsContent>

        <TabsContent value="corporate_client" keepMounted className="pt-4">
          <PartnersList
            partnerType="corporate_client"
            initialItems={recordsOf("corporate_client")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Create `app/admin/(dashboard)/partners/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function PartnersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-72" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the sidebar item**

In `components/admin/admin-nav.tsx`, add `HandshakeIcon` to the `lucide-react` import:

```tsx
import {
  PackageIcon,
  ContactIcon,
  UsersIcon,
  LayoutTemplateIcon,
  MapPinIcon,
  TicketIcon,
  FileTextIcon,
  HandshakeIcon,
} from "lucide-react";
```

Insert this item in the `items` array directly after the Destinations item (before the `// CRM-03` comment):

```tsx
    // Homepage brand-partner / corporate-client logos. Reuses
    // canManagePackages like Content above -- no new permission toggle.
    {
      href: "/admin/partners",
      label: "Partners",
      icon: HandshakeIcon,
      show: canManagePackages,
    },
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/partners "app/admin/(dashboard)/partners" components/admin/admin-nav.tsx
git commit -m "feat: partners admin module"
```

---

### Task 5: Seed script for the four existing logos

**Files:**
- Create: `supabase/seed-assets/partner-logos/brand-partners/dna.svg`, `.../brand-partners/fl.svg`, `.../corporate-clients/sga.svg`, `.../corporate-clients/paynamics.png` (copies)
- Create: `scripts/seed-partner-logos.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `PartnerType` (Task 1); `uploadObject(key: string, body: Buffer, contentType: string): Promise<void>` from `lib/storage/r2-client.ts`; `partners` types (Task 2).
- Produces: `npm run seed:partners`.

- [ ] **Step 1: Copy the logo files into seed assets**

The originals stay in `public/logos` for now — the homepage still reads them until Task 7.

```bash
mkdir -p supabase/seed-assets/partner-logos/brand-partners supabase/seed-assets/partner-logos/corporate-clients
cp public/logos/brand-partners/dna.svg public/logos/brand-partners/fl.svg supabase/seed-assets/partner-logos/brand-partners/
cp "public/logos/corporate partners/sga.svg" "public/logos/corporate partners/paynamics.png" supabase/seed-assets/partner-logos/corporate-clients/
ls -R supabase/seed-assets/partner-logos
```

Expected: four files listed under the two subfolders.

- [ ] **Step 2: Write the seed script**

Create `scripts/seed-partner-logos.ts`:

```ts
/**
 * One-off, re-runnable seed that moves the four logos the homepage used to
 * read from public/logos/brand-partners and "corporate partners" into the
 * admin-managed partners table: uploads each file to R2 and inserts its
 * row. Run once per environment, after 20261011120000_partners_module.sql
 * is applied there and before the homepage switches to reading the table.
 *
 * Run via `npm run seed:partners` (-> `tsx --env-file=.env.local
 * scripts/seed-partner-logos.ts`), with the Supabase and R2 variables
 * pointed at the environment being seeded.
 *
 * Re-runnable: an entry is skipped when a row already has its storage key,
 * or the same group and name -- so re-running never duplicates, including
 * after staff have renamed a seeded partner in the admin. Links are left
 * blank and names come from the filenames; staff set both in the admin.
 *
 * SECURITY: uses the Supabase service-role key, which bypasses Row Level
 * Security. CLI/dev-tooling only -- never import from app/ or components/.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../types/database";
import { uploadObject } from "../lib/storage/r2-client";
import type { PartnerType } from "../lib/partners/partner-type";

/**
 * Node 20 has no native global WebSocket; @supabase/supabase-js always
 * constructs a RealtimeClient, which requires one. Mirrors scripts/seed.ts.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run seed:partners`."
  );
}

const SEED_ASSETS_DIR = join(
  process.cwd(),
  "supabase",
  "seed-assets",
  "partner-logos"
);

type SeedPartner = {
  file: string;
  partnerType: PartnerType;
  name: string;
  contentType: string;
  storagePath: string;
};

const SEED_PARTNERS: ReadonlyArray<SeedPartner> = [
  {
    file: "brand-partners/dna.svg",
    partnerType: "brand_partner",
    name: "DNA",
    contentType: "image/svg+xml",
    storagePath: "partners/seed-brand-partner-dna.svg",
  },
  {
    file: "brand-partners/fl.svg",
    partnerType: "brand_partner",
    name: "FL",
    contentType: "image/svg+xml",
    storagePath: "partners/seed-brand-partner-fl.svg",
  },
  {
    file: "corporate-clients/sga.svg",
    partnerType: "corporate_client",
    name: "SGA",
    contentType: "image/svg+xml",
    storagePath: "partners/seed-corporate-client-sga.svg",
  },
  {
    file: "corporate-clients/paynamics.png",
    partnerType: "corporate_client",
    name: "Paynamics",
    contentType: "image/png",
    storagePath: "partners/seed-corporate-client-paynamics.png",
  },
];

type Client = ReturnType<typeof createClient<Database>>;

async function alreadySeeded(
  supabase: Client,
  partner: SeedPartner
): Promise<boolean> {
  const byPath = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("logo_storage_path", partner.storagePath);
  if (byPath.error) throw new Error(byPath.error.message);
  if ((byPath.count ?? 0) > 0) return true;

  const byName = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("partner_type", partner.partnerType)
    .eq("name", partner.name);
  if (byName.error) throw new Error(byName.error.message);
  return (byName.count ?? 0) > 0;
}

async function nextSortOrder(
  supabase: Client,
  partnerType: PartnerType
): Promise<number> {
  const { data, error } = await supabase
    .from("partners")
    .select("sort_order")
    .eq("partner_type", partnerType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.sort_order + 1 : 0;
}

async function seed() {
  await ensureWebSocketPolyfill();

  console.log(
    `Seeding partner logos into ${new URL(SUPABASE_URL!).host} ` +
      `(R2 bucket: ${process.env.R2_BUCKET_NAME ?? "<unset>"})...`
  );

  const supabase = createClient<Database>(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let created = 0;
  for (const partner of SEED_PARTNERS) {
    if (await alreadySeeded(supabase, partner)) {
      console.log(`  skip    ${partner.name} (already present)`);
      continue;
    }

    const body = readFileSync(join(SEED_ASSETS_DIR, partner.file));
    await uploadObject(partner.storagePath, body, partner.contentType);

    const { error } = await supabase.from("partners").insert({
      partner_type: partner.partnerType,
      name: partner.name,
      logo_storage_path: partner.storagePath,
      sort_order: await nextSortOrder(supabase, partner.partnerType),
    });
    if (error) {
      throw new Error(`insert failed for ${partner.name}: ${error.message}`);
    }

    created += 1;
    console.log(`  created ${partner.name} (${partner.partnerType})`);
  }

  console.log(
    `Seed complete: ${created} created, ${SEED_PARTNERS.length - created} skipped.`
  );
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

Add to `package.json` `scripts`, after `"seed:admin"`:

```json
    "seed:partners": "tsx --env-file=.env.local scripts/seed-partner-logos.ts",
```

- [ ] **Step 3: Run it against the local stack**

In a shell with the local-stack exports from Local Environment Notes (check `echo "$SUPABASE_URL"` prints `http://127.0.0.1:54321`). Check `grep R2_BUCKET_NAME .env.local` first — the upload goes to that bucket under `partners/seed-*`, the same keys the real rollout will write.

Run: `npm run seed:partners`
Expected: header line naming host `127.0.0.1:54321`, four `created` lines, `Seed complete: 4 created, 0 skipped.`

- [ ] **Step 4: Prove it is re-runnable, including after a rename**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "update partners set name = 'DNA Micro' where name = 'DNA';"
npm run seed:partners
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select partner_type, name, sort_order, link_url, is_published from partners order by partner_type, sort_order;"
```

Expected: four `skip` lines and `Seed complete: 0 created, 4 skipped.`; the query returns exactly 4 rows — `brand_partner` `DNA Micro` 0 and `FL` 1, `corporate_client` `SGA` 0 and `Paynamics` 1 — all with null links and `is_published = t`.

- [ ] **Step 5: Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/seed-assets/partner-logos scripts/seed-partner-logos.ts package.json
git commit -m "feat: seed script for existing partner logos"
```

---

### Task 6: Verify the admin module in a browser and mark the first push

Nothing public has changed yet. This task proves the admin module works end to end against the local stack, then marks the commit the user pushes first.

**Files:**
- None created or modified in the repo, unless a check fails and needs a fix.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: local branch `partners-push-a` pointing at the verified commit.

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build succeeds; the route list includes `/admin/partners`.

- [ ] **Step 2: Start a scratch copy of the app on port 3100 against the local stack**

Replace `<scratch>` with the session scratchpad directory. Run from the repo root, in a shell that has the local-stack exports from Local Environment Notes:

```bash
rsync -a --delete --exclude .next --exclude node_modules --exclude .git ./ <scratch>/travelsentro/
cp -Rc node_modules <scratch>/travelsentro/node_modules
npm run seed:admin
(cd <scratch>/travelsentro && npx next dev -p 3100)
```

`npm run seed:admin` creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local` on the local stack (the exported variables win over `.env.local`'s Supabase values). Run the dev server in the background and wait for "Ready". Expected: `http://localhost:3100/admin/login` loads.

- [ ] **Step 3: Drive the admin checks**

Log in at `http://localhost:3100/admin/login` with the seeded admin, then open **Partners** in the sidebar. Drive this by hand or with `playwright-core` (`channel: "chrome"`). Every line must hold:

1. The sidebar shows **Partners** after Destinations; `/admin/partners` shows two tabs. Brand Partners lists `DNA Micro` and `FL`; Corporate Clients lists `SGA` and `Paynamics` (from Task 5), each with its logo thumbnail and "No link".
2. **Add with a bare domain:** Brand Partners → Add Brand Partner → name `Test Brand`, upload any PNG, link `example.com`, save. Toast "Brand Partner added."; the row appears last and shows `https://example.com`.
3. **Add without a link:** Corporate Clients → add `Test Client` with an SVG and no link. Row appears last showing "No link". The Brand Partners tab is unchanged.
4. **Rejected link:** edit `Test Brand`, set the link to `javascript:alert(1)`, save. The field shows "Enter a valid website address, e.g. https://example.com" and nothing is saved.
5. **Required fields:** open Add, save with everything empty. "Please enter a name" and "Please upload a logo" both show.
6. **Wrong file:** in Add, choose a `.pdf` (switch the picker to "All files"). Toast "Logo must be an SVG, PNG, JPG or WebP image."; no thumbnail appears. Choose an image over 2 MB: toast "Logo must be 2 MB or smaller."
7. **Reorder:** drag `Test Brand` to the top of Brand Partners, reload the page. The order persists; Corporate Clients' order is unchanged.
8. **Add after delete:** delete `FL` (confirm dialog names it), then add `Test Brand 2`. It appears last, not in `FL`'s old position.
9. **Hide:** switch `Test Client` to hidden. A "Hidden" badge shows and survives a reload.
10. **SVG key:** run `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select name, logo_storage_path from partners where name = 'Test Client';"` — the path ends in `.svg`.

- [ ] **Step 4: Check a user without the permission is blocked**

The `prevent_self_last_admin_lockout` trigger refuses to demote the last admin, so it is switched off for the duration of this check — on the **local** database only (confirm the connection string is `127.0.0.1:54322`). Replace `<ADMIN_EMAIL>` with the value from `.env.local`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "alter table profiles disable trigger prevent_self_last_admin_lockout; update profiles set role = 'staff', can_manage_packages = false where email = '<ADMIN_EMAIL>';"
```

Reload `http://localhost:3100/admin/partners`. Expected: redirect to `/admin/forbidden`, and the sidebar no longer shows Partners, Packages, Content or Destinations. Then restore both the role and the trigger:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "update profiles set role = 'admin' where email = '<ADMIN_EMAIL>'; alter table profiles enable trigger prevent_self_last_admin_lockout;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select role from profiles where email = '<ADMIN_EMAIL>'; select tgenabled from pg_trigger where tgname = 'prevent_self_last_admin_lockout';"
```

Expected: `admin`, and `tgenabled` = `O` (enabled).

- [ ] **Step 5: Fix anything that failed**

For each failed check: fix it in the repo (not the scratch copy), re-run `npx tsc --noEmit && npm run lint`, re-sync with the `rsync` line from Step 2, re-check, and commit the fix with a `fix:` message. Leave the dev server and the test rows in place — Task 7 uses them.

- [ ] **Step 6: Mark the first push**

```bash
git branch -f partners-push-a HEAD
git log --oneline -1 partners-push-a
```

Expected: prints the latest commit. This is what the user pushes first (see Rollout handoff).

---

### Task 7: Homepage reads partners from the database and links the logos

**Files:**
- Create: `components/homepage/partner-logo.tsx`
- Modify: `lib/logos/read-logo-folder.ts`
- Modify: `components/homepage/partner-affiliations.tsx`
- Modify: `components/homepage/corporate-clients.tsx`
- Modify: `app/(public)/page.tsx`
- Modify: `next.config.ts` (comment only)
- Delete: `public/logos/brand-partners/`, `public/logos/corporate partners/`

**Interfaces:**
- Consumes: published `partners` rows (Task 2); `getPublicImageUrl`; `FadeImage`.
- Produces: `LogoFile = { id: string; src: string; alt: string; href?: string }`; `PartnerLogo({ logo }: { logo: LogoFile })`.

- [ ] **Step 1: Read the `next/image` SVG note**

Read the "`dangerouslyAllowSVG`" section of `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`. Confirm it still says `unoptimized` "happens automatically when `src` ends with `.svg`" — that is what lets an R2-hosted SVG logo render through `FadeImage` without any config change. If the installed docs say otherwise, stop and pass `unoptimized` explicitly in Step 3 when `logo.src` ends in `.svg`.

- [ ] **Step 2: Add `href` to the logo shape**

In `lib/logos/read-logo-folder.ts`, replace the type:

```ts
export type LogoFile = {
  id: string;
  src: string;
  alt: string;
  /** Set only for admin-managed partner logos that have a website link. */
  href?: string;
};
```

Replace the doc comment above `readLogoFolder` with:

```ts
/**
 * Reads image files directly out of a public/logos subfolder so dropping a
 * new logo file into the folder is enough to make it appear on the site --
 * no DB row, no admin upload step. Used for the Airlines and Travel
 * Partners marquees only; Brand Partners and Corporate Clients are managed
 * in the admin (/admin/partners) and come from the `partners` table.
 *
 * Next.js's build-time file tracer can't see this dynamic fs.readdir call,
 * so next.config.ts's outputFileTracingIncludes explicitly bundles
 * public/logos/** into the function that renders the homepage -- without
 * that, this would work in dev but silently return [] in production.
 */
```

- [ ] **Step 3: Write the logo component**

Create `components/homepage/partner-logo.tsx`:

```tsx
import { FadeImage } from "@/components/motion/fade-image";
import type { LogoFile } from "@/lib/logos/read-logo-folder";

/**
 * One Brand Partner / Corporate Client logo. When the partner has a
 * website link (set in /admin/partners) the logo is a link to it, opened
 * in a new tab so the visitor keeps their place on this site; without one
 * it renders as a plain image.
 */
export function PartnerLogo({ logo }: { logo: LogoFile }) {
  const image = (
    <FadeImage
      src={logo.src}
      alt={logo.alt}
      width={280}
      height={140}
      className="h-auto max-h-28 w-auto max-w-64 object-contain"
    />
  );

  if (!logo.href) return image;

  return (
    <a
      href={logo.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visit ${logo.alt}'s website (opens in a new tab)`}
      className="rounded-md transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:outline-none"
    >
      {image}
    </a>
  );
}
```

- [ ] **Step 4: Use it in the two sections**

In `components/homepage/partner-affiliations.tsx`:

Add the import after the `LogoMarquee` import:

```tsx
import { PartnerLogo } from "@/components/homepage/partner-logo";
```

Replace the non-marquee branch of `LogoGroup`:

```tsx
        <div className="flex flex-wrap items-center justify-center gap-12">
          {logos.map((logo) => (
            <PartnerLogo key={logo.id} logo={logo} />
          ))}
        </div>
```

Remove the now-unused `FadeImage` import from that file. Replace the doc comment above `PartnerAffiliations` with:

```tsx
/**
 * Homepage Partner Affiliations section -- three independently conditional
 * sub-groups. Airlines and Travel Partners are sourced straight from their
 * own public/logos subfolders (see read-logo-folder.ts); Brand Partners is
 * admin-managed (/admin/partners) and its logos link to the partner's
 * website when one is set. Renders a muted placeholder message (rather
 * than disappearing) when no group has any logos yet, matching
 * CorporateClients' own visibility check.
 */
```

In `components/homepage/corporate-clients.tsx`:

Replace the `FadeImage` import with:

```tsx
import { PartnerLogo } from "@/components/homepage/partner-logo";
```

Replace the logo grid:

```tsx
        <div className="flex flex-wrap items-center justify-center gap-12">
          {logos.map((logo) => (
            <PartnerLogo key={logo.id} logo={logo} />
          ))}
        </div>
```

Replace the doc comment above `CorporateClients` with:

```tsx
/**
 * Homepage Corporate Clients logo band -- admin-managed (/admin/partners,
 * `partners` rows with partner_type = 'corporate_client'), independently
 * conditional from PartnerAffiliations' own visibility check. A logo links
 * to the client's website when one is set. Renders a muted placeholder
 * message (rather than disappearing) when there are no visible logos yet.
 */
```

- [ ] **Step 5: Query partners on the homepage**

In `app/(public)/page.tsx`:

Change the `readLogoFolder` import to also bring in the type:

```tsx
import { readLogoFolder, type LogoFile } from "@/lib/logos/read-logo-folder";
```

Replace the comment above the `Promise.all` destructure:

```tsx
  // All sections are independent reads (no query depends on another's
  // result), so they run concurrently instead of as a request waterfall.
  // Airline and Travel Partner logos are not part of this -- they're read
  // synchronously from public/logos/** below, not queried from Supabase.
```

Add to the destructured array, after the `visaServicesData` line:

```tsx
    { data: partnersData, error: partnersError },
```

Add to the `Promise.all` array, after the `visa_services` query:

```tsx
    // (5) Brand partners + corporate clients -- admin-managed
    // (/admin/partners), split by partner_type below. Public read RLS
    // already scopes this to is_published = true; the query-layer filter
    // is kept too, same as every other section.
    supabase
      .from("partners")
      .select("id, partner_type, name, logo_storage_path, link_url")
      .eq("is_published", true)
      .order("sort_order", { ascending: true }),
```

Replace the block that currently reads the four folders (from the `// Partner/client logos come straight from public/logos/**` comment through the `corporateClientLogos` line) with:

```tsx
  // Airline and Travel Partner logos come straight from public/logos/** --
  // dropping a new file into one of these folders is enough to make it
  // appear, no DB row or admin upload step involved.
  const airlineLogos = readLogoFolder("airlines");
  const operatorLogos = readLogoFolder("operators");

  if (partnersError) {
    console.error("Failed to load partners:", partnersError.message);
  }

  type PartnerRow = Pick<
    Database["public"]["Tables"]["partners"]["Row"],
    "id" | "partner_type" | "name" | "logo_storage_path" | "link_url"
  >;

  // The database constraint already guarantees link_url is http(s); the
  // check is repeated here because this value becomes an href.
  function partnerLogosOf(partnerType: string): LogoFile[] {
    return ((partnersData ?? []) as PartnerRow[])
      .filter((partner) => partner.partner_type === partnerType)
      .map((partner) => ({
        id: partner.id,
        src: getPublicImageUrl(partner.logo_storage_path),
        alt: partner.name,
        href:
          partner.link_url && /^https?:\/\//i.test(partner.link_url)
            ? partner.link_url
            : undefined,
      }));
  }

  const brandPartnerLogos = partnerLogosOf("brand_partner");
  const corporateClientLogos = partnerLogosOf("corporate_client");
```

The JSX (`<PartnerAffiliations ... brandPartners={brandPartnerLogos} />` and `<CorporateClients logos={corporateClientLogos} />`) is unchanged.

- [ ] **Step 6: Remove the two folders and update the config comment**

```bash
git rm -r -q public/logos/brand-partners "public/logos/corporate partners"
ls public/logos
```

Expected: `airlines` and `operators` remain.

In `next.config.ts`, replace the comment above `outputFileTracingIncludes`:

```ts
  // The homepage reads public/logos/** via fs.readdirSync at render time
  // (lib/logos/read-logo-folder.ts) so airline and travel-partner logos can
  // be added by dropping a file in, with no DB row. Next's file tracer
  // can't see that dynamic fs call, so without this the folder is missing
  // from the deployed function and reads silently return [] in production.
  // (Brand partner and corporate client logos are admin-managed and live
  // in R2, not here.)
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 8: Check the homepage in the browser**

Re-sync the scratch copy (the `rsync` line from Task 6 Step 2; the dev server picks the changes up) and open `http://localhost:3100/`. Using the rows left from Task 6:

1. **Brand Partners** (inside Partner Affiliations) shows the visible brand logos in admin order. `Test Brand` is an `<a>` with `href="https://example.com"`, `target="_blank"`, `rel="noopener noreferrer"`; clicking it opens example.com in a new tab and the homepage tab stays put. A logo with no link (`DNA Micro`) is not inside an `<a>`.
2. **Corporate Clients** shows `SGA` and `Paynamics`; hidden `Test Client` is absent.
3. Both an SVG logo and a PNG logo render (not broken images), and the browser console has no `next/image` errors.
4. In the admin, add the link `https://www.paynamics.com` to `Paynamics`, reload the homepage: the logo is now a link — without waiting 60 seconds.
5. Hide every Corporate Client in the admin, reload: the section shows "Client logos coming soon." Un-hide them.
6. The Airlines and Travel Partners marquees still scroll with their logos.
7. Tab through the page with the keyboard: a linked logo shows a visible focus ring.

Fix anything that fails in the repo, re-run Step 7, re-sync, re-check.

- [ ] **Step 9: Clean up the test data**

Stop the port-3100 dev server. Remove the test logos from R2 and the local rows — save this as `<scratch>/travelsentro/scripts/cleanup-partners.ts` (in the scratch copy, which has `node_modules`; never in the repo) and run it from the scratch copy with the local-stack exports still set:

```ts
import { createClient } from "@supabase/supabase-js";
import { deleteObject } from "../lib/storage/r2-client";

async function main() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase
    .from("partners")
    .select("id, name, logo_storage_path")
    .like("name", "Test %");
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    await deleteObject(row.logo_storage_path);
    await supabase.from("partners").delete().eq("id", row.id);
    console.log(`removed ${row.name} (${row.logo_storage_path})`);
  }
}

main();
```

Run: `(cd <scratch>/travelsentro && npx tsx --env-file=.env.local scripts/cleanup-partners.ts)`
Expected: one `removed` line per `Test …` row. The four `partners/seed-*` objects stay in R2 — they are the same keys the real seed writes. Then delete `<scratch>/travelsentro`.

- [ ] **Step 10: Commit**

```bash
git add -A components/homepage lib/logos/read-logo-folder.ts "app/(public)/page.tsx" next.config.ts public/logos
git commit -m "feat: partner logos managed in admin with website links"
git status --short
```

Expected: clean working tree.

---

## Rollout handoff

Do not push. Report this to the user, per environment (`staging` first, then `master`):

1. **Push the admin module** — everything up to the `partners-push-a` branch:
   `git push origin partners-push-a:staging`
   The migration applies through the "Supabase migrations" workflow and Vercel deploys. The public site is unchanged.
2. **Seed** — with `.env.local` pointed at that environment's Supabase project and R2 bucket: `npm run seed:partners`. Expect `4 created, 0 skipped`. Then open `/admin/partners`, rename the four entries and add their website links.
3. **Push the homepage switch** — `git push origin staging`. The two sections now read from the database.
4. Delete the marker when both environments are done: `git branch -D partners-push-a`.

If step 3 ever ships before step 2, nothing breaks: the two sections show their "coming soon" placeholder until the seed is run.
