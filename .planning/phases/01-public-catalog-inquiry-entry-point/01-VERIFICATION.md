---
phase: 01-public-catalog-inquiry-entry-point
verified: 2026-07-18T22:15:00Z
status: passed
score: 5/5 roadmap success criteria verified; 9/9 requirements satisfied; 0 unresolved blockers
behavior_unverified: 0
overrides_applied: 0
process_note: "ROADMAP marks this phase mode: mvp, but the phase goal text ('A prospective customer can browse tour packages and reach out to inquire via WhatsApp, Facebook, or the inquiry form, on any device.') does not conform to the 'As a [role], I want to [capability], so that [outcome].' User Story format (gsd_run query user-story.validate returns valid:false). Verification proceeded using standard goal-backward methodology against ROADMAP.md's 5 explicit Success Criteria and each PLAN's must_haves. Same process note as the initial verification pass — unchanged by this re-verification."
re_verification:
  previous_status: gaps_found
  previous_score: "5/5 roadmap success criteria verified; 1 unresolved critical anti-pattern found"
  gaps_closed:
    - "RLS is the actual authorization boundary for unpublished/draft package data (not just an app-layer query filter)"
  gaps_remaining: []
  regressions: []
---

# Phase 1: Public Catalog & Inquiry Entry Point Verification Report

**Phase Goal:** A prospective customer can browse tour packages and reach out to inquire via WhatsApp, Facebook, or the inquiry form, on any device.
**Verified:** 2026-07-18T22:15:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (CR-01 RLS fix)

## Re-Verification Summary

The previous verification pass (2026-07-18T21:30:00Z) found all 5 ROADMAP success criteria and all 9 PUBL requirements satisfied, but blocked on one critical anti-pattern (CR-01): every table's `"public read"` RLS policy was `using (true)` — unconditional — so RLS was not actually the authorization boundary for unpublished/draft packages; only the app's `.eq("is_published", true)` query filter hid them, which is bypassable by anyone holding the (intentionally public) anon key via direct REST calls.

This gap has been closed by migration `supabase/migrations/20260718140000_fix_public_read_rls_is_published.sql` (commit `f78517a`). This re-verification independently confirms the fix is real, deployed, and enforced at the database layer — not just present in a migration file.

### Independent verification performed (this pass, not trusting SUMMARY/user claims)

1. **Migration file content check** — `20260718140000_fix_public_read_rls_is_published.sql` drops and recreates all 5 `"public read"` policies: `packages` scoped to `is_published = true` directly; `package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts` scoped via `exists (select 1 from packages p where p.id = <table>.package_id and p.is_published)`. Matches CR-01's drafted remediation SQL exactly.
2. **Remote migration status** — `supabase link --project-ref <ref>` + `supabase migration list --linked` confirms both migrations (`20260718114727`, `20260718140000`) are applied on the linked live project (`Local` and `Remote` columns match for both).
3. **Live schema dump (ground truth, not the migration file)** — `supabase db dump --linked --schema public` pulled the **actual applied schema** directly from the live Postgres instance. The dumped `CREATE POLICY` statements for all 5 tables match the fix exactly:
   - `packages`: `FOR SELECT USING (("is_published" = true))`
   - `package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts`: each `FOR SELECT USING ((EXISTS (SELECT 1 FROM packages p WHERE (p.id = <table>.package_id AND p.is_published))))`
   This proves the policy text in the migration file is what's actually enforced live — not merely what was intended.
4. **Live behavioral round-trip test (independent of the developer's own manual check described in the task)** — using the project's own anon and service-role keys from `.env.local`:
   - Confirmed via anon key that `banaue-rice-terraces` (id `fa771a56-...`) and its `itinerary_days` rows were readable while `is_published = true` (baseline).
   - Used the service-role key to `PATCH` that package to `is_published = false`.
   - Re-queried with the **anon key only** immediately after: `packages?id=eq.<id>` → `[]` (empty); full `packages` list → banaue absent, only the 2 still-published packages returned; `itinerary_days`, `package_inclusions`, `faq_facts`, `package_photos` filtered by that `package_id` → all four returned `[]`.
   - Restored `is_published = true` via the service-role key and re-confirmed the anon key could read the package and its itinerary again, returning the app to its pre-test state (no data loss, no lingering unpublished packages — final live state matches the state at test start).
   - This directly proves RLS — not the app's query filter — is now the enforcement boundary: the anon key was denied read access at the database layer for an unpublished package across all 5 tables, then correctly regranted once republished.

**Conclusion: the RLS gap (CR-01) is genuinely closed, confirmed against the live database, not just the migration file or SUMMARY claims.**

### Regression check on the other 4 previously-passing success criteria

The fix commit (`f78517a`) touches only one new SQL migration file — zero application code changed (`git show --stat f78517a` shows a single new file, 52 insertions, 0 deletions, 0 files modified). Given this, and because RLS policies for `is_published = true` rows are unchanged in effect (all 3 seeded packages remain published), a full regression sweep was still run to be thorough:

- `npm run build` — compiled successfully, same 5 routes (`/`, `/_not-found`, `/contact`, `/packages`, `/packages/[slug]`) as the previous pass.
- `npm run lint` — no errors.
- Started `next dev` and re-curled the live app against the (now RLS-fixed) database:
  - `/` → 200, `/packages` → 200, `/contact` → 200, `/packages/palawan-island-hopping` → 200, `/packages/does-not-exist` → 404
  - `/packages` list still renders all 3 published packages (Palawan, Siargao, Banaue) with real prices
  - `/packages/palawan-island-hopping` still renders "Itinerary", "What's Included", "Trip Facts" sections
  - WhatsApp CTA still renders package-specific `https://wa.me/639205351673?text=...` link; Facebook CTA still renders `https://web.facebook.com/profile.php?id=61567102791951`
- No regressions found. All previously-verified behavior is intact post-fix.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can browse a list of tour packages, each showing photo, name, and starting "from ₱X" price | ✓ VERIFIED | Re-confirmed live: `/packages` returns 200 with 3 real seeded packages (Palawan/Siargao/Banaue), real Storage-backed photos, "From ₱8,500"/"₱7,200"/"₱6,300" badges |
| 2 | User can view a package detail page with day-by-day itinerary/duration, line-item price and inclusions/exclusions, photo gallery, and FAQ/trip-facts section | ✓ VERIFIED | Re-confirmed live: detail page renders "Itinerary", "What's Included", "Trip Facts" sections with seeded content |
| 3 | User can contact the business directly from any package via a WhatsApp deep link or Facebook page link, with no checkout step | ✓ VERIFIED | Re-confirmed live: package-specific `wa.me` link and Facebook page link both present, `target="_blank" rel="noopener noreferrer"`; no checkout component anywhere |
| 4 | User can submit an inquiry via the existing Formspree form | ✓ VERIFIED | Unchanged by this fix (no app code touched); previously confirmed via code contract + human-approved E2E test in 01-05/01-07 checkpoints |
| 5 | The package list, detail pages, and inquiry flow are usable on mobile | ✓ VERIFIED | Unchanged by this fix (no app code touched); previously confirmed via responsive classes + human-approved breakpoint check |

**Score:** 5/5 ROADMAP success criteria verified

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|--------------|--------|----------|
| PUBL-01 | Browse list w/ photo/name/price | ✓ SATISFIED | Re-confirmed live |
| PUBL-02 | Detail page w/ itinerary/duration | ✓ SATISFIED | Re-confirmed live |
| PUBL-03 | Line-item price/inclusions/exclusions | ✓ SATISFIED | Re-confirmed live |
| PUBL-04 | Photo gallery | ✓ SATISFIED | Unchanged, previously verified |
| PUBL-05 | WhatsApp CTA | ✓ SATISFIED | Re-confirmed live |
| PUBL-06 | Facebook CTA | ✓ SATISFIED | Re-confirmed live |
| PUBL-07 | Formspree inquiry submission | ✓ SATISFIED | Unchanged, previously verified |
| PUBL-08 | FAQ/trip-facts section | ✓ SATISFIED | Re-confirmed live |
| PUBL-09 | Mobile-responsive | ✓ SATISFIED | Unchanged, previously verified |

No orphaned requirements — `.planning/REQUIREMENTS.md` line 101 ("PUBL-01 through PUBL-09 | Phase 1 | Complete") and lines 12-20 (all 9 checked `[x]`) all map to requirements declared in this phase's plans (01-01 through 01-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | **CR-01 RESOLVED**: RLS policies now scoped to `is_published` on all 5 tables, confirmed live via schema dump and anon-key behavioral test | — | Previously 🛑 Blocker, now closed. No longer an anti-pattern. |
| `app/(public)/packages/[slug]/page.tsx` | 52 | Supabase query error silently converted to `notFound()` with no logging | ⚠️ Warning | Non-blocking. Documented as WR-01 in `01-REVIEW.md`, not yet fixed. Does not block phase goal achievement. |
| `app/(public)/packages/[slug]/page.tsx` | (whole file) | No `generateMetadata` — falls back to generic root title/description | ⚠️ Warning | Non-blocking SEO gap. Documented as WR-02, not yet fixed. |
| `lib/formspree.ts` | 30-37 | `fetch` has no timeout/`AbortController` | ⚠️ Warning | Non-blocking. Documented as WR-03, not yet fixed. |
| `lib/supabase/client.ts` / `server.ts` | env var access | Non-null-asserted env vars (`process.env.X!`) with no validation | ℹ️ Info | Documented as WR-06. |

No TBD/FIXME/XXX debt markers found in `20260718140000_fix_public_read_rls_is_published.sql` or any other file touched by this phase or its fix.

The 3 remaining ⚠️ Warning items (WR-01, WR-02, WR-03) are non-blocking code-quality items already tracked in `01-REVIEW.md`, unrelated to phase goal achievement, and were not part of the blocking gap this re-verification pass addresses.

## Human Verification Required

None. All previously-approved human checkpoints (01-05 Task 2, 01-07 Task 2) remain valid — the RLS fix touched only database authorization policy, not any UI/UX surface those checkpoints covered. The live anon-key/service-role-key round-trip test performed in this pass is a programmatic, reproducible database-layer check, not a human-judgment item.

## Gaps Summary

No gaps remain. The single blocking gap from the previous verification pass (CR-01 — RLS policies unconditionally `using (true)`, making the app's query filter the only thing hiding unpublished package data) has been independently confirmed closed:

- The fix migration's SQL matches CR-01's drafted remediation exactly.
- Both migrations are applied on the linked live Supabase project (`supabase migration list --linked`).
- A live schema dump pulled directly from the remote database (`supabase db dump --linked`) shows the actual enforced policy text matches the fix — not just the migration file's stated intent.
- An independent live behavioral test (temporarily unpublishing a real package via the service-role key, confirming the anon key was denied read access across all 5 tables, then restoring it) proves RLS is now the real authorization boundary.
- A regression sweep (build, lint, live route/content checks) confirms no other previously-passing success criteria were affected by this database-only fix.

Phase 1's goal — a prospective customer can browse tour packages and reach out to inquire via WhatsApp, Facebook, or the inquiry form, on any device — is fully achieved, and the database now enforces its own "published packages only" authorization boundary independent of application code, which was the missing piece before Phase 2 introduces admin-managed draft/unpublished packages.

---

_Verified: 2026-07-18T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
