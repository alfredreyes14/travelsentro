---
phase: 02-admin-access-package-management
reviewed: 2026-07-19T03:21:15Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - lib/supabase/proxy.ts
  - package.json
  - scripts/verify-auth-confirm-reachable.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 02: Code Review Report (Gap-Closure Delta: Plan 02-10)

**Reviewed:** 2026-07-19T03:21:15Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Scope note

This pass reviews only the plan 02-10 gap-closure delta (3 files: a one-line `lib/supabase/proxy.ts` allow-list addition, its `package.json` script entry, and a new standalone verification script). It intentionally does **not** re-assess the rest of phase 02. A comprehensive 54-file review remains in git history at commit `cfbe794` (`.planning` history) — that review's prior CR-01 (`/admin/auth/confirm` missing from `UNGATED_ADMIN_PATHS`, causing the password-reset PKCE callback to be redirected to `/admin/login` before it could run) is confirmed **RESOLVED** by this delta: the path is now present in the allow-list (`lib/supabase/proxy.ts:8`), and `app/admin/auth/confirm/route.ts` (re-read for context, not in this pass's file scope) exports only `GET`, matching the new verification script's assumptions. That prior review's other still-open items (WR-01 through WR-12, IN-01 through IN-03 — none of which touch these 3 files) are out of scope for this pass and were not re-evaluated here; consult commit `cfbe794`'s `02-REVIEW.md` content for their current status.

## Summary

The functional fix is correct and I independently corroborated its mechanics: `app/admin/auth/confirm/route.ts` exports only `GET`, so an unauthenticated `POST` to that path returns Next.js's default `405` once the proxy stops intercepting it — exactly the differential signal the new script checks for. I verified with a local Node HTTP server that Node's native `fetch` with `redirect: "manual"` returns the real status code and `Location` header (not an opaque redirect, which only applies under browser CORS semantics), so `verify-auth-confirm-reachable.ts`'s core methodology is sound. I also confirmed via `find app/admin -iname "*confirm*"` that no sibling or nested route currently exists under the `/admin/auth/confirm` prefix, so this specific addition does not currently create an exploitable widening.

The new script itself has no injection, SSRF, or unsafe-eval surface: it takes no untrusted input, builds no dynamic strings for execution, and only ever calls `fetch` against an operator-supplied `BASE_URL` (default `localhost:3100`). `package.json`'s new `verify:auth-confirm` entry follows the same `tsx --env-file=.env.local scripts/<name>.ts` shape as its sibling `verify:permission-denial` entry.

One WARNING and two INFO items remain, detailed below — none block this specific fix from being correct and safe to ship, but the WARNING addresses exactly the "no unintended prefix-matching" question this review was asked to check, and is a real (if currently latent) gap.

## Warnings

### WR-01: `UNGATED_ADMIN_PATHS` uses prefix matching, not exact-path matching — the new entry inherits a silent-widening risk

**File:** `lib/supabase/proxy.ts:47-49`
**Issue:** The gate check is:
```ts
const isUngatedAdminPath = UNGATED_ADMIN_PATHS.some((path) =>
  request.nextUrl.pathname.startsWith(path)
);
```
This matches any pathname that *starts with* an allow-listed entry, not just the entry itself. For the newly added `"/admin/auth/confirm"`, this means any future path sharing that prefix — e.g. a hypothetical `/admin/auth/confirm-email`, `/admin/auth/confirmation`, or a nested `/admin/auth/confirm/callback` — would silently become unauthenticated-reachable the moment such a route is added, with no signal at the allow-list call site that this is happening. This is not a purely theoretical concern for this codebase: the array already exhibits the identical weakness for `"/admin/login"`, `"/admin/forgot-password"`, and `"/admin/reset-password"`, so the failure mode has established precedent to recur, and this diff extends that same pattern to a fourth entry rather than correcting it.

Today, `find app/admin -iname "*confirm*"` confirms no sibling/nested route exists under this prefix, so there is no *currently* active bypass beyond the single intended path — this is a design-hardening finding, not an active exploit. Given the file's own doc comment states this allow-list is only an "optimistic" layer in front of `lib/auth/dal.ts`'s real enforcement, the blast radius of a future silent widening is bounded — but it's still worth closing now while the fix is small, rather than leaving a recurring footgun for whoever next adds an admin auth-flow route.
**Fix:** Use exact-match instead of unconstrained `startsWith`:
```ts
const isUngatedAdminPath = UNGATED_ADMIN_PATHS.some(
  (path) => request.nextUrl.pathname === path
);
```
If any entry is ever intended to gate a whole subtree (none currently are), express that explicitly per-entry, e.g. `pathname === path || pathname.startsWith(path + "/")`, rather than relying on bare `startsWith` for every entry regardless of intent.

## Info

### IN-01: New `verify:auth-confirm` npm script requires `.env.local` to exist despite the script needing no environment variables

**File:** `package.json:13`, `scripts/verify-auth-confirm-reachable.ts:25-27`
**Issue:** The script's own docstring states: "no Supabase client of any kind is constructed, and no environment variables beyond an optional `BASE_URL` override are required." Yet the npm entry wires it through `tsx --env-file=.env.local scripts/verify-auth-confirm-reachable.ts`, mirroring the credentialed sibling script (`verify:permission-denial`) that genuinely needs `.env.local`'s contents. I confirmed directly that both plain `node --env-file=<missing>` and `npx tsx --env-file=<missing>` hard-fail with `not found` (exit code 9) before any script code runs if the target file doesn't exist. In this repo `.env.local` already exists (required by the other scripts), so this isn't a practical failure today, but it means this script can't actually be run standalone/credential-free in an environment that only has this one script's needs in mind (e.g. a minimal CI job with intentionally no `.env.local` because nothing else there needs secrets).
**Fix:** Drop `--env-file=.env.local` from this specific script's npm entry, since it reads nothing from it beyond the optional `BASE_URL`, which can be supplied via a normal shell env var:
```json
"verify:auth-confirm": "tsx scripts/verify-auth-confirm-reachable.ts"
```

### IN-02: `CheckResult` type and pass/fail reporting loop duplicated verbatim between the two verify scripts

**File:** `scripts/verify-auth-confirm-reachable.ts:36, 96-104` (compare `scripts/verify-permission-denial.ts:80, 240-248`)
**Issue:** Both `scripts/verify-permission-denial.ts` and the new `scripts/verify-auth-confirm-reachable.ts` independently declare an identical `type CheckResult = { name: string; pass: boolean; detail: string }` and an identical pass/fail summary-printing loop (`for (const r of results) { ... }` plus the trailing `N/M checks passed` line). This is copy-paste duplication across what is now two — and, given the project's pattern of adding a new standalone verify script per gap-closure plan, likely a growing family of — verification scripts.
**Fix:** Extract the shared type and reporting loop into a small shared helper, e.g. `scripts/lib/verify-report.ts`, and import it from both scripts:
```ts
// scripts/lib/verify-report.ts
export type CheckResult = { name: string; pass: boolean; detail: string };

export function printResults(title: string, baseUrl: string, results: CheckResult[]): boolean {
  console.log(`\n${title} -- BASE_URL=${baseUrl}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);
  return allPass;
}
```

---

_Reviewed: 2026-07-19T03:21:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
