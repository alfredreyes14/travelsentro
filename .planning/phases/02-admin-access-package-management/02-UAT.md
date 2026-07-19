---
status: diagnosed
phase: 02-admin-access-package-management
source: [02-VERIFICATION.md]
started: 2026-07-19T03:28:49Z
updated: 2026-07-19T05:35:00Z
---

## Current Test

[testing paused — 1 item outstanding]

## Tests

### 1. Full browser login click-through
expected: Visit /admin/login, log in with ADMIN_EMAIL/ADMIN_PASSWORD, confirm landing on /admin/packages with a visible sidebar (Packages + Users for Admin). Login succeeds, session persists across a page refresh, sidebar renders per D-13/D-14.
result: pass

### 2. Real password-reset email round-trip
expected: Request a reset for a real mailbox, click the actual emailed link, set a new password, log in with it. Reset email arrives with a working link; the code-exchange lands the user authenticated on /admin/reset-password (not /admin/login); the new password logs in successfully. Newly unblocked this round — the proxy-level defect (CR-01) that made this unreachable is now independently confirmed closed; this is the single highest-priority item remaining.
result: issue
reported: "I received the email but when I click the link, I got bounced back to login page. I clicked the link from the email tab (same browser, not a different one) then I got redirected to login."
severity: major

### 3. Add-Staff-Account dialog
expected: Admin creates a new Staff account, sets name/role/permission toggles, confirms the new account can log in and sees only the nav items its permissions allow. Account created, permission toggles persist, new account's sidebar matches D-13/D-14 exactly.
result: pass

### 4. Drag-reorder package list + publish/feature switch interactions
expected: Drag-reorder persists new sort_order; switches optimistically update and persist; a simulated failure reverts the switch and shows a toast.
result: pass

### 5. Multi-tab package create/edit form
expected: Itinerary days, inclusions, FAQ facts, price/photos across the full package-form UI. All fields save correctly; package appears/updates on the Phase 1 public site after publish.
result: issue
reported: "There is no save or publish button. Just create package, nothing happens when I click it."
severity: major

### 6. Photo upload/reorder/delete flow
expected: Photos upload, drag-reorder persists display_order, delete removes the Storage object and DB row. Known edge-case gaps flagged in 02-REVIEW.md (commit cfbe794) WR-08/WR-09/WR-10 worth exercising manually.
result: blocked
blocked_by: other
reason: "Photo upload requires an existing package (photos says 'need to save the package first'), but Test 5's Create Package button does nothing — same root cause, could not reach photo upload to test it independently."

### 7. Full visual/styling pass
expected: Admin panel matches TravelSentro brand tokens (teal/orange sidebar, Prata/Inter typography) consistently across all screens, including the /admin/forbidden page's visual parity with error.tsx.
result: issue
reported: "Use #021f4a for primary and #f49314 for secondary."
severity: cosmetic

## Summary

total: 7
passed: 3
issues: 3
pending: 0
skipped: 0
blocked: 1

## Gaps

- truth: "Reset email arrives with a working link; the code-exchange lands the user authenticated on /admin/reset-password (not /admin/login); the new password logs in successfully."
  status: failed
  reason: "User reported: I received the email but when I click the link, I got bounced back to login page. I clicked the link from the email tab (same browser, not a different one) then I got redirected to login."
  severity: major
  test: 2
  root_cause: "NOT an application code bug -- the hosted Supabase Auth project (ref wisesrmizzgfbwlktoxh) does not honor the redirect_to value requestPasswordReset() requests (http://localhost:3000/admin/auth/confirm) when generating password-recovery links, EVEN THOUGH that exact URL is present in the project's configured Redirect URL allow-list (confirmed live via the Supabase Management API). Live reproduction (via disposable test users created and cleaned up through the Management API -- no real email sent to anyone) showed every tested redirect_to variant, including exact allow-list matches, gets silently replaced with the bare Site URL (http://127.0.0.1:3000, path stripped). Because of this, the emailed reset link's redirect never actually targets /admin/auth/confirm, so exchangeCodeForSession() in route.ts is never reached -- the round trip fails BEFORE the app's own PKCE-exchange code runs. This is a known class of Supabase/GoTrue platform behavior for resetPasswordForEmail() with localhost-based redirect URLs (upstream: supabase/supabase#10534, #36640, #39718), not a defect in this codebase. 02-10's proxy-layer reachability fix (lib/supabase/proxy.ts) remains valid and necessary -- it is just not sufficient, since this defect is upstream of the proxy entirely. Caveat: the debug agent's reproduction used admin.generateLink() (architecturally distinct from the real resetPasswordForEmail() client flow per Supabase's own docs), so the redirect_to/path-stripping finding is strongly evidenced but not 100% confirmed against a real received email -- recommended one-look confirmation: copy the raw link address (not click) from a real reset email and inspect its redirect_to= param."
  artifacts:
    - path: "Supabase hosted project config (Authentication -> URL Configuration, project ref wisesrmizzgfbwlktoxh)"
      issue: "Declared Redirect URL allow-list and the live GoTrue server's actual redirect_to-handling behavior are out of sync -- config declares the URL is allowed, but generated links don't route to it"
  missing:
    - "Re-save the Redirect URLs list in the Supabase dashboard (Authentication -> URL Configuration) to force GoTrue to reload its config -- config/server state may just be stale"
    - "Confirm with a real received email: copy the link address (don't click) and inspect its redirect_to= param to settle the remaining reproduction nuance"
    - "Consider testing against a real deployed URL (once Vercel is linked) instead of localhost, since the known upstream reports are specifically about localhost redirect URLs -- production may not exhibit this at all"
    - "If the dashboard re-save doesn't resolve it, escalate to Supabase support referencing supabase/supabase#10534, #36640, #39718"
  debug_session: ".planning/debug/password-reset-bounce-to-login.md"

- truth: "Admin/Staff with 'manage packages' permission can create tour packages via the package-form UI."
  status: failed
  reason: "User reported: There is no save or publish button. Just create package, nothing happens when I click it."
  severity: major
  test: 5
  root_cause: "PackageForm's submit is wired as form.handleSubmit(onSubmit) with NO onInvalid handler (components/admin/package-form.tsx:134) -- on Zod validation failure, react-hook-form silently updates formState.errors and never calls onSubmit, so nothing observable happens (no toast, no navigation, no DB row). Compounded by components/ui/tabs.tsx's TabsContent sitting on Base UI's Tabs.Panel, whose keepMounted defaults to false (confirmed in node_modules/@base-ui/react/tabs/panel/TabsPanel.mjs) -- an inactive tab's FormField/FormMessage error UI is fully unmounted from the DOM, not just hidden, so even if the user WAS on the right tab when submitting, errors on OTHER tabs are invisible. Likely concrete trigger: bestTimeToGo and groupSize (both min(1)-required in package-form-schema.ts) sit at the bottom of the crowded 'Inclusions & FAQ' tab and are easy to miss; the Create Package button lives outside <Tabs> (always visible regardless of active tab), so a user can fill Details/Itinerary, skip those two fields, land on a different tab, and click submit with zero visible feedback."
  artifacts:
    - path: "components/admin/package-form.tsx"
      issue: "form.handleSubmit(onSubmit) has no onInvalid handler to surface validation failures to the user"
    - path: "components/ui/tabs.tsx"
      issue: "TabsContent doesn't set keepMounted on Base UI's Tabs.Panel, so inactive tabs' error UI is unmounted rather than hidden"
    - path: "components/admin/package-form-schema.ts"
      issue: "bestTimeToGo/groupSize required fields are easy to overlook, positioned at the bottom of a crowded tab"
  missing:
    - "Add an onInvalid handler to form.handleSubmit(onSubmit, onInvalid) that shows a toast (e.g. \"Please fix the highlighted fields\") and/or programmatically switches to the first tab containing an error"
    - "Consider setting keepMounted on TabsContent for tabs containing form fields so FormMessage errors remain visible/reachable even when not the active tab"
  debug_session: ".planning/debug/create-package-button-noop.md"

- truth: "Admin panel matches TravelSentro brand tokens (teal/orange sidebar, Prata/Inter typography) consistently across all screens."
  status: failed
  reason: "User reported: Use #021f4a for primary and #f49314 for secondary. Current tokens in app/globals.css: --primary: #f5793a, --secondary: #0e5c63, --sidebar: #0e5c63 (same as --secondary), --sidebar-primary: #f5793a (same as --primary). User's requested values differ from both current hex codes and, for --primary specifically, from the previously documented UI-SPEC accent-orange role."
  severity: cosmetic
  test: 7
  root_cause: "Not a bug -- the brand color values hardcoded in app/globals.css (--primary: #f5793a, --secondary: #0e5c63) simply don't match the values the user now wants (#021f4a primary, #f49314 secondary). No investigation needed; this is a direct token-value update."
  artifacts:
    - path: "app/globals.css"
      issue: "--primary (#f5793a -> #021f4a) and --secondary (#0e5c63 -> #f49314) need updating; --sidebar/--sidebar-primary/--sidebar-accent/--sidebar-border are derived from these two via literal duplication or color-mix() and must be updated in lockstep (lines ~63-91 in the :root block)."
  missing:
    - "Update --primary and --secondary in app/globals.css to the new hex values"
    - "Update the 3 derived --sidebar-* tokens that currently hardcode or color-mix() off the old --secondary value"
    - "Scope check: these are global CSS custom properties, not admin-scoped -- changing them also re-colors the already-shipped Phase 1 public site (WhatsApp/Facebook CTA buttons, package badges, header/footer), not just the admin panel. Confirm with the user whether that's intended before applying, since Test 7 was scoped as an admin-panel visual check but the fix's blast radius is site-wide."
    - "Update .planning/phases/01-public-catalog-inquiry-entry-point/01-UI-SPEC.md and .planning/phases/02-admin-access-package-management/02-UI-SPEC.md's documented hex values so future phases don't regress back to the old colors"
  debug_session: ""
