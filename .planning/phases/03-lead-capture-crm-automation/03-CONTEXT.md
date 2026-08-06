# Phase 3: Lead Capture, CRM & Automation - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Every inquiry submitted via the existing Formspree-backed inquiry form (per-package or general Contact Us) reliably becomes a tracked lead/contact record in a new CRM, with no duplicate leads created even if the same submission is delivered twice. The customer gets an instant auto-reply email; Admin/Staff with "message customers" permission get an internal notification email. Admin/Staff can view a contact's inquiry history as a timeline, see which package (if any) a lead inquired about, search/filter contacts by name/status/tag, and update lead status (New/Contacted/Qualified/Won/Lost). Bulk/individual outbound messaging and SMS are explicitly Phase 4 — this phase is capture + auto-acknowledge + internal alert only.

</domain>

<decisions>
## Implementation Decisions

### Inquiry Ingestion Architecture
- **D-01:** The inquiry form (`components/inquiry/inquiry-form.tsx`) changes from submitting directly to Formspree client-side to submitting to a new internal API route. That route writes the lead to the CRM first, then forwards the same payload to Formspree server-side. This supersedes PROJECT.md's original "dual-submit from the client" plan — routing through our own endpoint gives a single write path and the CRM write no longer depends on the client's tab staying open for two sequential fetches.
- **D-02:** Formspree becomes a backup/dashboard copy, not the primary path. If the CRM lead write succeeds but the server-side forward to Formspree fails, log the failure and do NOT block or retry-loop the customer's success response — the CRM write is what "no lead lost" actually depends on. No retry queue/cron for the Formspree forward.
- **D-03 (AUTO-03 dedup key):** The inquiry form generates a client-side UUID (request ID) included in the submission payload; the API route upserts the lead on that ID. This also protects against accidental double-clicks on the Send button, not just literal webhook redelivery. (Formspree submission IDs are not usable for dedup here since Formspree is no longer the first receiver of the payload — see D-01.)

### Contact / Duplicate Identity
- **D-04:** Email address is the stable identity key for a contact. A second (or later) inquiry from the same email attaches to the EXISTING contact as a new entry in their inquiry-history timeline (CRM-02) rather than creating a second contact record — matches how a real sales team tracks a lead across multiple questions/packages.
- **D-05:** If a later inquiry from the same email includes a different phone number, update the contact's phone field in place (email wins as the identity key; phone is just contact info). No manual-review/reconciliation flag — keep this simple.

### Internal Notification (AUTO-02)
- **D-06:** Every Admin/Staff account with the "message customers" permission receives the internal notification email on a new inquiry (matches AUTO-02's wording exactly) — not Admins-only.
- **D-07:** One email per inquiry, sent immediately — no digest/batching. "Instant" is the point; a digest would delay response to a fresh lead, and per-inquiry volume is expected to comfortably fit Resend's 100/day free-tier cap at this business's scale.

### Package Linkage (CRM-06)
- **D-08:** The per-package inquiry form is changed to send the package's real `package_id` (not just the display name it sends today) alongside `package` (name, kept for the auto-reply/notification email copy). The lead record stores `package_id` as a proper foreign key, giving a real, clickable link into the package record from the CRM — survives package renames, unlike name-string matching.
- **D-09:** The general "Contact Us" form has no package context, so `package_id` is nullable on the lead record. CRM-06 only applies when a package context exists; a general inquiry's CRM record shows as a general inquiry with no package link. The Contact Us form is NOT changed to force a package selection.

### Claude's Discretion
- Exact CRM table schema (contacts/leads table shape, `leads`/`contacts`/`inquiries` naming, status enum implementation, tags implementation — freeform text array vs. a separate tags table).
- Exact API route path/structure for the new inquiry-ingestion endpoint and its request/response contract.
- Auto-reply and internal-notification email template content/copy and React Email component structure (Resend + React Email per CLAUDE.md's stack decision — not re-litigated here).
- CRM list/detail page layout, search/filter UI, and where CRM nav items land in the existing admin sidebar (Packages/Users nav already exists per Phase 2 D-14 — this phase adds CRM).
- Whether `status` and `tags` get their own admin nav entry point or live only within the CRM list/detail views.
- Exact validation/error-handling for the new inquiry API route (rate limiting, payload validation via zod).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & requirements
- `.planning/PROJECT.md` — Core value, business context, constraints, Key Decisions table (note: the "dual-submit workaround" decision row is superseded by D-01/D-02 above — route-through-our-endpoint, not dual-submit)
- `.planning/REQUIREMENTS.md` §CRM (CRM-01–07) and §Automation (AUTO-01–03) — full requirement list this phase must satisfy
- `.planning/ROADMAP.md` §Phase 3 — goal, success criteria, dependencies (depends on Phase 2)
- `.claude/CLAUDE.md` §Free Email Sending: Comparison — Resend (100/day cap) is the primary transactional provider for auto-reply + internal alert; relevant since D-07 keeps notification volume within that cap

### Prior phase (code this phase extends)
- `lib/formspree.ts` — existing `submitToFormspree()` client helper and `InquiryPayload` type; the new API route's payload shape should extend this, not replace it wholesale
- `components/inquiry/inquiry-form.tsx` — existing client form component being changed per D-01/D-08 (submit target + package_id field)
- `.planning/phases/02-admin-access-package-management/02-CONTEXT.md` — `profiles` table role/permission model (`message customers` / `manage packages` / `edit CRM`) this phase's CRM permission gating must reuse, and D-14 (admin nav only has Packages/Users today — CRM nav is new this phase)
- `supabase/migrations/20260718114727_create_package_schema.sql` — `packages` table this phase's `package_id` FK (D-08) references

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/formspree.ts` — `submitToFormspree()` fetch wrapper and `InquiryPayload`/`FormspreeResult` types; the new server-side forward-to-Formspree call can reuse this same request shape
- `components/inquiry/inquiry-form.tsx` — react-hook-form + zod inquiry form already built and styled; only its submit target and payload change (D-01, D-08), not its UI
- `lib/action-result.ts` — existing `ActionResult` pattern used by Server Actions in `actions/` (e.g. `actions/users.ts`, `actions/packages.ts`) — likely the right shape for any new CRM Server Actions (status update, tag edit, etc.)
- `lib/auth/dal.ts` — `requireAdmin()`/`requirePermission()`/`requirePermissionOrRedirect()` guards from Phase 2, directly reusable for gating CRM read/write by the "edit CRM" permission

### Established Patterns
- Package management (Phase 2) established the pattern of Server Actions in `actions/*.ts` each starting with a `require*()` permission check before any Supabase write — CRM Server Actions (status update, tag edit, note) should follow the identical pattern
- No API route (`app/api/*` or Route Handler) exists yet anywhere in the codebase — this phase's inquiry-ingestion endpoint is the first Route Handler in the project
- No `leads`/`contacts` table exists yet (confirmed via `types/database.ts`) — this is a new schema surface, greenfield within the existing Supabase project

### Integration Points
- New inquiry-ingestion Route Handler sits between `components/inquiry/inquiry-form.tsx` (client) and both Supabase (new leads table) and Formspree (server-side forward)
- New CRM tables need RLS write policies scoped to "edit CRM" permission (read) and likely broader read access for any authenticated Staff (view-only per REQUIREMENTS CRM-03), following the `has_permission()` RLS pattern Phase 2 established
- Admin sidebar nav (Phase 2 D-14) gets a new "CRM" (or "Contacts"/"Leads") section this phase — Packages/Users sections stay unchanged

</code_context>

<specifics>
## Specific Ideas

- The routing-through-our-own-endpoint approach (D-01) was chosen specifically because it changes the reliability story for the phase's core value prop ("no lead lost") — the CRM write no longer has any dependency on Formspree being reachable at all, since it happens first and Formspree becomes a secondary/backup copy.
- Email is deliberately the ONLY identity key for contact dedup (D-04/D-05) — no fuzzy name-matching, no phone-based matching — kept intentionally simple.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (A real admin dashboard summarizing lead/message activity was already deferred to "Phase 3 or 4" during Phase 2's discussion per `02-CONTEXT.md`; not re-raised here since it's not required by any of this phase's CRM-0X/AUTO-0X requirements — worth considering once this phase's data actually exists, but not part of this phase's scope.)

</deferred>

---

*Phase: 3-Lead Capture, CRM & Automation*
*Context gathered: 2026-07-20*
