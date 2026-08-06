---
phase: 05
slug: mobile-responsive-visual-polish
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-27
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Admin browser -> sendBulkEmail/sendBulkSms Server Actions | Card-mode CRM UI (05-02) is a new rendering path into the same existing, permission-gated (`can_message_customers`) bulk-send Server Actions from Phase 4 — this phase does not touch those Server Actions themselves. | Contact selection state, message content |
| Admin browser -> publishPackage/featurePackage/softDeletePackage/reorderPackages Server Actions | Card-mode packages UI (05-03) is a new rendering path into the same existing, permission-gated (`can_manage_packages`) Server Actions from Phase 2. | Package mutation commands |
| Admin browser -> deactivateAccount Server Action | Card-mode users UI (05-04) is a new rendering path into the same existing, admin-only (`requireAdminOrRedirect`) Server Action from Phase 2. | Account deactivation commands |
| None new (05-01, 05-05, 05-06) | Pure CSS/className and static-markup changes on already-gated, already-shipped UI (public zoom-reflow fix, admin sidebar/card elevation, dialog/alert-dialog elevation) — no new input handling, no new data path. | n/a |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | — | package-gallery.tsx / public pages | low | accept | Pure CSS positioning fix + live-verification pass over already-published, already-server-filtered (`is_published=true`) package data. No auth/session/data-mutation logic touched. | closed |
| T-05-02 | Tampering | crm-table.tsx card-mode select cell | high | mitigate | Card mode renders the existing "select" column's cell via `flexRender`/`row.getIsSelected()`/`row.toggleSelected()` instead of re-implementing the `opted_out` check. Verified directly in `components/admin/crm-table.tsx` (lines 293, 319: `flexRender(...)` on the shared select columnDef; line 174: `enableRowSelection: (row) => !row.original.opted_out` is the single, shared guard). No duplicate/drifted consent-check implementation exists. | closed |
| T-05-03 | Elevation of Privilege | crm-table.tsx card-mode navigation/actions | low | accept | Card mode calls the identical `router.push`/`MessageComposeDialog` entry points already reached from desktop rows — no new Server Action call site introduced. | closed |
| T-05-04 | Elevation of Privilege | package-list-card.tsx | low | accept | Card mode calls the identical `publishPackage`/`featurePackage`/`softDeletePackage`/`reorderPackages` Server Actions already called by `package-list-row.tsx` — same `@/actions/packages` import path, no new unguarded call site. | closed |
| T-05-05 | — | packages/loading.tsx | low | accept | Static skeleton, no data fetching or user input. | closed |
| T-05-06 | Elevation of Privilege | users-table.tsx card-mode actions | low | accept | Card mode calls the identical `setEditingAccount`/`setDeactivatingAccount` handlers and the identical `deactivateAccount` Server Action already used by the table — existing self-/last-admin lockout guards (02-17) remain the sole enforcement path. | closed |
| T-05-07 | — | users/loading.tsx | low | accept | Static skeleton, no data fetching or user input. | closed |
| T-05-08 | — | layout.tsx, card.tsx | low | accept | className-only changes; `getProfile()` re-validation, permission-conditional nav rendering, and `SidebarProvider`'s state/cookie logic left untouched (confirmed via plan's `git diff --quiet components/ui/sidebar.tsx` gate). | closed |
| T-05-09 | — | dialog.tsx, alert-dialog.tsx | low | accept | Single Tailwind `shadow-md` utility added, matching existing dropdown-menu.tsx/select.tsx convention. `DialogPrimitive`/`AlertDialogPrimitive` logic and every consumer's data/permission flow untouched — confirmed via each task's `git diff` acceptance criterion (only the targeted className string changed). | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-01, T-05-03, T-05-04, T-05-05, T-05-06, T-05-07, T-05-08, T-05-09 | All 8 are low-severity, no-new-attack-surface changes (pure CSS/className/static-markup on already-gated primitives, or card-mode UI reusing identical existing Server Action call sites and permission checks). Accepted at plan-authorship time in each plan's `<threat_model>` STRIDE register; no implementation-time mitigation required beyond reuse verification, which each plan's acceptance criteria (grep/git-diff gates) already enforced. | GSD secure-phase (retroactive audit) | 2026-07-27 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-27 | 9 | 9 | 0 | GSD secure-phase (orchestrator; short-circuit path — threats_open: 0, register_authored_at_plan_time: true, asvs_level: 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-27
