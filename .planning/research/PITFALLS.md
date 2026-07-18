# Pitfalls Research

**Domain:** Small-business catalog/marketing site + admin panel/CRM/messaging on a free-tier stack (Next.js/Vercel + Supabase + Formspree + email/SMS provider), Philippines market
**Researched:** 2026-07-18
**Confidence:** MEDIUM (web-sourced, cross-checked against official docs/help pages where possible; no HIGH-confidence curated sources used)

## Critical Pitfalls

### Pitfall 1: Formspree webhooks are not on the free plan — the core "webhook Formspree into CRM" decision may not be free

**What goes wrong:**
The team plans to keep the existing Formspree inquiry form and receive submissions into the new CRM via a webhook. Formspree's webhook integration (and its "Plugins" — Zapier, Slack, CRM connectors, generic Webhook) requires a **Professional or Business** paid plan, not the Free plan. The Free plan is capped at 50 submissions/month, 2 linked emails, and has no webhook/plugin capability at all. A team scoping this "free-tier first" can build the whole ingestion pipeline assuming a free webhook exists, then discover late that it requires a recurring paid subscription (~$10+/mo) just to receive submissions.

**Why it happens:**
Formspree is well known for its generous free tier for the *form itself* (unlimited forms, 50 submissions/mo), so teams assume all integrations are equally free. Webhook/integration gating is documented but easy to miss since the core "does this form work for free" question gets answered first.

**How to avoid:**
Resolve this in Phase 0/1 before any ingestion architecture is built. Options to evaluate: (a) accept the Formspree paid plan cost as a fixed line-item exception to "free tier wherever possible" (same logic already applied to SMS); (b) use Formspree's free-tier email notification + a serverless inbound-email-parsing webhook (e.g. Vercel/Resend inbound email parsing) as a workaround; (c) replace Formspree's submission handling with a self-hosted form endpoint (Next.js API route + Supabase insert) that produces the same public-facing form UX, eliminating the webhook dependency entirely; (d) use Formspree's AJAX submit + a client-side callback that also posts to the CRM endpoint directly (in addition to Formspree) rather than relying on Formspree's server-side webhook. Confirm actual current Formspree plan pricing/limits before committing (verify at build time — pricing pages change).

**Warning signs:**
Ingestion architecture assumes "Formspree → webhook → Supabase" is free; no line item budgeted for Formspree Professional; the decision "Keep Formspree, webhook into CRM" in PROJECT.md is still marked "Pending" with no cost validation.

**Phase to address:**
Requirements/architecture phase for inquiry capture (Phase 1) — validate this dependency and pick an approach before building CRM lead-creation logic around it.

---

### Pitfall 2: Supabase free-tier project auto-pauses after 1 week of inactivity

**What goes wrong:**
A Supabase Free plan project that receives no database activity for 7 days is automatically paused. The next request (e.g., a customer loading the site, staff logging into admin) fails or hangs until someone manually resumes the project (~30s) from the dashboard. For a low-traffic new travel site (especially pre-launch, staging, or slow-season periods), this is a realistic scenario, not an edge case.

**Why it happens:**
Free tier is designed to reclaim idle resources; teams building an MVP with intermittent traffic (only staff activity during business hours, or a site not yet marketed) don't generate the "sufficient database activity" Supabase's pause detector expects.

**How to avoid:**
Add a lightweight scheduled keep-alive (e.g., a Vercel Cron Job — note Hobby cron is capped at 2 jobs, daily-only frequency — hitting a Supabase table with a trivial insert/select) so the project never crosses the inactivity threshold. Alternatively, accept the risk for a true side-project/staging environment but explicitly budget for Supabase Pro ($25/mo) once the site is live and depended upon by the business for real inquiries, since paused projects are unacceptable for "no lead is lost" as a success metric.

**Warning signs:**
No monitoring/uptime check on the Supabase-backed API; business reports "the contact form / admin panel didn't work this morning" after a quiet period; staging environment used only occasionally.

**Phase to address:**
Infrastructure/deployment setup phase (early) — decide keep-alive strategy or budget for Pro before go-live, since this directly threatens the core value prop (no lost leads).

---

### Pitfall 3: Vercel Hobby plan is officially for non-commercial use — a live revenue-generating business site is a licensing mismatch

**What goes wrong:**
TravelSentro is an existing, operating business (has an FB page, closes real bookings). Vercel's Hobby (free) plan terms restrict use to personal, non-commercial projects; using it to host a live business site technically violates the ToS, and Vercel has been known to flag/limit such accounts. Beyond the licensing question, Hobby has hard resource caps with **no overage** — hitting the bandwidth/Active-CPU/function-invocation limit takes the whole site offline until the next billing cycle, with no way to pay your way past it.

**Why it happens:**
"Free tier wherever possible" is a stated project constraint, and Hobby is the path of least resistance during development — but the constraint isn't revisited once the site goes live for a real business.

**How to avoid:**
Plan (in the roadmap, not as an afterthought) to move to Vercel Pro ($20/mo) at or before public launch — this is a reasonable, small, justified exception to "free tier wherever possible," similar to the already-accepted SMS pay-as-you-go exception. During development/staging, Hobby is fine. Also budget for the 10s (up to 60s configurable) function timeout limit on Hobby if any admin action (bulk email/SMS send, image processing) might run long — Pro raises this ceiling.

**Warning signs:**
Site goes fully live on Hobby with no monitoring of bandwidth/CPU usage; bulk-send features (email/SMS blasts) start timing out as contact lists grow; no Pro-plan line item in cost planning.

**Phase to address:**
Infrastructure/deployment phase, and again before the "go live" milestone — revisit the free-tier assumption specifically for hosting once the site is customer-facing and depended upon.

---

### Pitfall 4: Email/SMS webhook and automation triggers cause duplicate auto-replies or internal alerts

**What goes wrong:**
The "instant auto-reply + internal alert" automation is naturally implemented as "on new inquiry webhook, send email(s)." Webhook providers (Formspree, or whatever inbound-lead source is used) deliver **at-least-once**, not exactly-once — network hiccups, slow handler responses, or provider-side retries cause the same inquiry event to be delivered and processed twice. Without deduplication, the customer gets two auto-reply emails and/or staff gets duplicate internal alerts (or, in the inverse failure, a crash mid-processing means the auto-reply silently never gets marked and the customer gets nothing while staff needs to guess whether it sent).

**Why it happens:**
The naive implementation is "webhook received → create lead → send emails" as one linear flow with no idempotency key, and the "mark as processed" step is done *after* sending rather than *before* (or not atomically), so a retry after a slow-but-successful send re-triggers the sends.

**How to avoid:**
Use a unique identifier from the inbound event (Formspree submission ID, or generate one at ingestion) as an idempotency key with a DB unique constraint on the leads/inquiries table. Mark the inquiry as "processed" (or record which notifications have been sent) in the same transaction as lead creation, before triggering the auto-reply/alert side effects, and check-before-send on every webhook invocation, not just the first. Treat "send auto-reply" and "send internal alert" as two independently idempotent operations (each can be retried safely without re-triggering the other).

**Warning signs:**
No unique constraint on the webhook's source submission ID; auto-reply/alert-sending code lives directly inside the webhook handler with no "already notified?" check; QA testing only ever submits the form once per test case (duplicate-delivery bugs only surface under retry/network-flake conditions, so they're easy to miss until production).

**Phase to address:**
Inquiry ingestion + automation phase (whichever phase builds "Formspree webhook → CRM lead → auto-reply + internal alert"). Verification should explicitly include "submit the same webhook payload twice" as a test case.

---

### Pitfall 5: Per-staff permission toggles quietly become a full custom authorization system

**What goes wrong:**
The spec calls for a simple fixed set — Admin vs Staff, with three per-staff toggles (message customers / manage packages / edit CRM). This sounds like "just three booleans," but if implemented ad hoc (checking `staff.can_manage_packages` scattered across UI components and API routes) it tends to sprawl: checks get duplicated between frontend and backend, some routes forget to check at all, and "read-only CRM by default" silently becomes inconsistent (e.g., staff can edit a lead's status from one screen but not another because that screen's check was missed).

**Why it happens:**
Three toggles feels too simple to warrant a real authorization layer, so teams inline `if (user.role === 'admin' || user.can_x)` checks per-endpoint instead of centralizing the permission model. This is the classic "under-engineered small RBAC" failure mode — not too much complexity, but no single source of truth, so permissions drift.

**How to avoid:**
Even with only 4 permission dimensions (role + 3 toggles), centralize the check in one place: a single `hasPermission(user, action)` helper (or Supabase RLS policies keyed off role/columns) used by every admin route/component, never inline role comparisons. Enforce at the database layer (Supabase RLS) as the source of truth, not just in UI — the UI hiding a button is not access control. Explicitly test the "staff, no toggles granted, read-only CRM" default case, since defaults are the easiest thing to get backwards (e.g., a missing check silently defaulting to "allowed" instead of "denied").
Do NOT build a generic roles/permissions table or admin UI for defining new permission types — PROJECT.md explicitly scopes this out ("Granular per-permission configurability... deferred"); resist scope creep toward a general RBAC engine.

**Warning signs:**
Permission checks written as `if (role === 'admin' || someBooleanFlag)` repeated in multiple files instead of one helper; any admin API route with no permission check at all "because it's obviously staff-only"; RLS not enabled or not enforcing the same rules as the UI.

**Phase to address:**
Admin auth/authorization phase — define the centralized permission model and RLS policies before building CRM/package/messaging admin screens on top of it; each subsequent admin feature phase should reuse (not reinvent) the same check.

---

### Pitfall 6: Bulk email/SMS sent without consent tracking or opt-out risks Data Privacy Act exposure and provider suspension

**What goes wrong:**
The CRM will hold contact/lead data originally captured for *inquiry purposes* (someone asked about a tour package), and the messaging feature allows bulk email/SMS to segments of that same contact list. Under the Philippines Data Privacy Act (RA 10173), reusing inquiry-purpose contact data for marketing/bulk outreach without fresh, specific consent is a compliance violation (NPC enforcement includes fines from ₱500,000–₱4,000,000 and possible imprisonment for serious violations), and most email/SMS providers will suspend an account for spam complaints/high bounce rates regardless of the legal angle. Separately, sending SMS from an unregistered/generic sender ID gets filtered or blocked by PH telcos outright (NTC requires pre-registered alphanumeric Sender IDs, which take 2–4 weeks to approve).

**Why it happens:**
"Bulk email/SMS to segment of contacts" is scoped as a straightforward CRUD/send feature without considering that every contact in the CRM originated from a lead-capture form, not an opt-in marketing list — the legal/compliance distinction between transactional/relationship messaging and bulk marketing gets lost in implementation.

**How to avoid:**
Model consent explicitly in the CRM schema (e.g., a consent/opt-out flag per contact, defaulted appropriately, distinct from "has an open inquiry"). Include an unsubscribe/opt-out mechanism in bulk sends (SMS: "Reply STOP"; email: unsubscribe link) and honor it immediately. Start Semaphore (or chosen SMS provider) sender-ID registration early — the 2–4 week lead time makes it a scheduling risk if left until the messaging phase is being built. Keep bulk-send volumes conservative initially (avoid triggering shared-IP/reputation issues on the email provider) and monitor bounce/complaint rates (email providers like Resend pause sending above ~4% bounce rate).

**Warning signs:**
No consent/opt-out field in the CRM data model; bulk send feature ships without an unsubscribe path; SMS sender ID registration not started until the messaging phase begins; no NPC-facing privacy notice covering how inquiry data may be used for follow-up messaging.

**Phase to address:**
CRM data model phase (add consent/opt-out fields early, they're expensive to retrofit) and the messaging/bulk-send phase (opt-out enforcement, sender ID registration lead time, deliverability safeguards).

---

### Pitfall 7: New sending domain has no reputation — first bulk/auto-reply emails land in spam

**What goes wrong:**
A freshly configured transactional email domain (via Resend or similar) with no sending history is unauthenticated in the eyes of receiving mail servers by default. If SPF/DKIM/DMARC aren't correctly configured — or DMARC alignment fails because the "From" address doesn't match the authenticated sending domain — auto-reply emails (the ones proving the core value prop: "reliably lands... no lead is lost," but in reverse, "customer reliably gets a reply") silently land in spam/promotions instead of the inbox, defeating the point of the instant-auto-reply feature.

**Why it happens:**
Domain/DNS setup for email is treated as a checkbox ("added the DNS records") rather than verified end-to-end; teams don't test actual inbox placement (only check "did the API call succeed"), and DMARC gets set to a strict policy (`p=reject`) too early without a monitoring period, or is skipped entirely.

**How to avoid:**
Configure SPF, DKIM, and DMARC on the sending domain before relying on auto-reply/bulk email in any real scenario; verify the visible "From" domain matches the authenticated (DKIM-signed / SPF-aligned) domain. Start DMARC in monitor mode (`p=none`) and tighten later. Test actual delivery to Gmail/Yahoo/Outlook test inboxes (not just "the API returned 200") before considering the auto-reply feature done. Keep bounce/complaint rates low from day one — avoid sending to any unverified/likely-invalid addresses in bulk sends.

**Warning signs:**
Auto-reply "works" in testing (API succeeds) but no one checked which folder it landed in; DNS records added but never verified with a mail-tester-style tool; DMARC set to reject immediately after setup.

**Phase to address:**
Email/messaging infrastructure setup phase (before automation phase ships) — verify actual deliverability as an explicit acceptance criterion, not just "API call succeeded."

---

### Pitfall 8: Service role / privileged Supabase key exposed in admin panel client code

**What goes wrong:**
The admin panel needs elevated database access for things a normal RLS-scoped user shouldn't do (e.g., an Admin managing other Admin/Staff accounts, or bulk operations). The path of least resistance is often to use Supabase's `service_role` key — which bypasses Row Level Security entirely — somewhere reachable from client-side code or a route that isn't properly server-only. If that key leaks (bundled into client JS, committed to a public repo, exposed via a misconfigured API route), an attacker gets full read/write/delete access to the entire database, including all customer/lead PII — a severe outcome for a CRM holding real customer contact data in the Philippines' regulated environment.

**Why it happens:**
RLS policies are harder to get right than "just use the admin key," especially for genuinely admin-only operations (user management, cross-tenant-like actions within Admin/Staff). Developers reach for `service_role` as a shortcut and don't isolate where it's used.

**How to avoid:**
Never use the `service_role` key in any code path reachable from the browser. Keep it exclusively in server-only code (Next.js Server Actions/API routes/server components, never `NEXT_PUBLIC_*`). Prefer RLS policies (keyed on the authenticated user's role/staff permissions) for as much of the admin panel as possible; reserve `service_role` for the narrow set of genuinely privileged server-side operations (e.g., admin user management) and audit those call sites specifically. Enable RLS on every table by default, including ones added later — don't assume "internal tool" tables are safe to leave open.

**Warning signs:**
`service_role` key present in any `.env` variable prefixed for client exposure, or referenced from a component instead of a server action/route handler; new tables created without RLS enabled; admin panel functionality "just works" without any policy because it's using the privileged key everywhere instead of scoped access.

**Phase to address:**
Admin auth/authorization phase and any phase touching Supabase schema changes — RLS-first policy review should be part of the definition of done for every new table.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `service_role` key to bypass RLS instead of writing policies | Faster to ship admin features | Full-database exposure risk if leaked; policies never get written, RLS debt accumulates | Never for anything reachable from the client; only in isolated, audited server-only admin operations |
| Inline permission checks (`if role === 'admin' || flag`) instead of a central helper | Faster initial implementation | Permission drift, inconsistent enforcement across screens, hard to audit | Never — even 3 toggles deserve one shared check function |
| Sending bulk email/SMS without a consent/opt-out field | Faster CRM/messaging MVP | DPA compliance exposure, provider account suspension | Never for real customer data; acceptable only in a throwaway/dev-seeded dataset |
| Keeping Vercel Hobby + Supabase Free through public launch with no monitoring | $0 cost during build | Site goes fully offline on cap breach or project pause, with no warning | Acceptable during private/staging development only, not once real leads are at stake |
| Webhook handler with no idempotency key | Simpler initial code | Duplicate auto-replies/alerts under retry, eroding trust in "no lead is lost" | Never — cheap to add up front, expensive to retrofit once duplicates have already shipped confusing emails to real customers |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Formspree | Assuming webhook delivery is free like the form itself | Verify Formspree plan tier supports webhooks (Professional/Business) before architecting ingestion around it, or use a workaround (self-hosted endpoint / inbound email parsing) |
| Supabase | Building against Free tier without a keep-alive, project silently pauses | Add a scheduled keep-alive ping, or budget Pro before go-live |
| Vercel | Treating Hobby as production-grade hosting for a live commercial site | Plan the Pro upgrade at/before public launch; monitor usage against caps |
| Resend / email provider | Sending bulk/auto-reply mail from an unauthenticated or newly-verified domain | Configure SPF/DKIM/DMARC, verify with a deliverability test, warm up sending volume gradually |
| Semaphore (or PH SMS provider) | Waiting until the messaging phase to start Sender ID registration | Start registration in parallel with earlier phases — approval takes 2–4 weeks |
| Webhook (any inbound source) | Handler triggers side effects (emails) without checking for duplicate delivery | Dedupe via unique event ID + DB constraint; mark-processed before side effects |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Bulk email/SMS send as a single long-running serverless function call | Function times out (10s default, up to 60s on Hobby) as contact list grows | Batch/queue sends (chunked with a background job or provider's own bulk API) rather than one synchronous loop in a request handler | Once a segment exceeds roughly what can be sent within the function timeout — worth testing at expected max contact-list size |
| Storing all package photo galleries directly in Supabase Storage on Free tier | 1GB storage cap fills up faster than expected with full-resolution photos | Compress/resize images on upload, consider a CDN/image-optimization layer (e.g. Vercel image optimization) | Once package catalog + galleries exceed ~1GB combined |
| Fetching all CRM leads/contacts client-side to filter/segment for bulk messaging in the browser | Works fine with a handful of leads, slows and leaks data to the client as the list grows | Filter/segment server-side (Supabase query or RLS-scoped API), paginate admin CRM views | Once lead count grows into the hundreds |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No signature/secret verification on the inbound webhook endpoint (Formspree → CRM) | Anyone who discovers the webhook URL can inject fake "leads" into the CRM or trigger auto-reply/alert spam | Verify Formspree's webhook signing (if available on the plan) or at minimum a shared-secret header; validate payload shape before creating a lead |
| `service_role` Supabase key reachable from client bundle | Full database compromise (see Pitfall 8) | Server-only usage, RLS-first design, `NEXT_PUBLIC_*` audit |
| Staff account permission toggles enforced only in UI, not in RLS/API | A staff member can still call the underlying API/DB directly (e.g., via devtools) to bypass a hidden button and edit CRM data or send messages they shouldn't | Enforce every permission at the RLS/API layer; treat UI hiding as UX only, never as the security boundary |
| Bulk messaging feature with no rate limit / send-volume guardrail | A compromised or misused staff/admin account could blast the entire contact list, triggering spam complaints and telco/provider bans | Add sane rate limits and a confirmation step for bulk sends above a threshold |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| WhatsApp/Facebook CTA links that aren't pre-filled with package context | Customer has to manually explain which package they're asking about, increasing friction and lost context | Use `wa.me` deep links with a pre-filled message referencing the package name/URL; Facebook Messenger link with ref parameter where possible |
| Auto-reply email is generic with no reference to which package was inquired about | Customer isn't sure their specific inquiry was received correctly | Include package name/details in the auto-reply template, pulled from the submitted inquiry |
| Staff has no visibility into whether the auto-reply actually sent (silent email failures) | Staff assumes the customer got a reply when the send failed, delaying follow-up and risking a lost lead | Log/display delivery status per inquiry in the CRM (sent / failed / bounced), not just "attempted" |
| Admin CRM defaults staff to read-only with no clear indicator of why they can't act | Staff confusion, support requests, or workarounds via Admin sharing credentials | Clear in-UI messaging when an action is blocked by permission ("Ask an Admin to enable 'edit CRM' for your account") |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Formspree → CRM webhook:** Often missing plan-tier validation — verify the webhook actually fires end-to-end from a live Formspree account on the plan actually being paid for, not just documentation review.
- [ ] **Auto-reply email:** Often missing real inbox-placement verification — verify it lands in the primary inbox (not spam) on Gmail/Yahoo/Outlook test accounts, not just "API returned success."
- [ ] **Per-staff permission toggles:** Often missing enforcement at the API/RLS layer — verify by calling the underlying API directly as a restricted staff account (bypassing the UI) and confirming it's actually blocked.
- [ ] **Bulk SMS/email:** Often missing opt-out handling — verify a "STOP"/unsubscribe request actually removes the contact from future bulk sends, not just that the button/reply exists.
- [ ] **Webhook idempotency:** Often missing retry-safety — verify by manually re-sending the same webhook payload twice and confirming no duplicate lead/duplicate auto-reply/duplicate alert.
- [ ] **Supabase Free tier keep-alive:** Often missing — verify what actually happens (error page? silent failure?) when the project has been idle 7+ days, don't just assume the mitigation cron is working.
- [ ] **SMS Sender ID:** Often missing — verify registration status before assuming SMS sends will actually be delivered/not filtered by PH telcos; don't discover the 2-4 week lead time during the launch week.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Formspree webhook turns out to require paid plan mid-build | LOW | Swap to a self-hosted inquiry-form API route + Supabase insert (drop Formspree dependency), or accept the paid plan cost as budget exception |
| Supabase project paused in production | LOW | Manually resume via dashboard (~30s), then add keep-alive cron retroactively; consider Pro if it recurs |
| Vercel Hobby cap hit, site offline | LOW-MEDIUM | Upgrade to Pro (immediate), review what caused the spike (traffic, function loop, bulk send) |
| Duplicate auto-reply/alert emails already sent to real customers | MEDIUM | Add idempotency retroactively; for affected customers, a brief apology/clarifying follow-up may be warranted since it affects trust in the business's responsiveness |
| Service role key exposure discovered | HIGH | Immediately rotate the key in Supabase dashboard, audit logs for unauthorized access, review/enable RLS on all tables, treat as a potential data breach requiring NPC 72-hour notification assessment |
| Bulk email domain reputation damaged (high spam complaints) | HIGH | Pause bulk sending, work through provider's reputation recovery guidance, may require a new sending subdomain and a slow re-warm; existing recipients' trust may take longer to repair |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Formspree webhook requires paid plan | Inquiry capture / architecture phase (early) | Confirm actual Formspree plan cost/tier decision is resolved, not left "Pending" |
| Supabase free-tier auto-pause | Infrastructure/deployment setup phase | Keep-alive cron in place and tested, or Pro budgeted before go-live |
| Vercel Hobby commercial-use / hard caps | Infrastructure/deployment setup phase, revisited pre-launch | Pro upgrade planned at go-live milestone; usage monitoring in place |
| Duplicate auto-reply/internal alert | Inquiry ingestion + automation phase | Test: resend identical webhook payload twice, confirm single lead + single email each |
| Under/over-engineered staff permissions | Admin auth/authorization phase | Test: restricted staff account calls API directly (bypassing UI), confirm blocked server-side |
| Bulk messaging consent/compliance | CRM data model phase + messaging phase | Consent/opt-out field exists in schema; unsubscribe request verified to work end-to-end |
| New-domain email deliverability | Email/messaging infrastructure setup phase | Test send lands in primary inbox (not spam) on major providers before automation ships |
| Service role key exposure | Admin auth/authorization phase + ongoing schema changes | Code review checklist: no `service_role` outside server-only code; RLS enabled on every new table |

## Sources

- [Supabase — Project Pausing docs](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase Free Tier Limits in 2026 — ITPath Solutions](https://www.itpathsolutions.com/supabase-free-tier-limits)
- [Vercel Hobby Plan docs](https://vercel.com/docs/plans/hobby)
- [Vercel — Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Free Tier Limits 2026 — deploywise.dev](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
- [Resend — Account Quotas and Limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- [Resend Pricing](https://resend.com/pricing)
- [Formspree — Webhooks help article (plan gating confirmed)](https://help.formspree.io/hc/en-us/articles/360015234873-Webhooks)
- [Formspree — Plugins help article (plan gating confirmed)](https://help.formspree.io/hc/en-us/articles/44775790301331-Plugins)
- [Formspree Plans](https://formspree.io/plans)
- [Webhook Reliability 2026: Idempotency & Retry Reference](https://www.digitalapplied.com/blog/webhook-reliability-idempotency-retries-engineering-reference-2026)
- [Hookdeck — How to Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- [RBAC Best Practices 2026 — TechPrescient](https://www.techprescient.com/blogs/role-based-access-control-best-practices/)
- [Common Admin Panel Problems and Practical Solutions — Medium](https://medium.com/@allpanelexche/common-admin-panel-problems-and-practical-solutions-af3fa09dbe84)
- [Supabase Anon Key vs Service Role Key](https://launchreadycode.com/blog/supabase-anon-key-vs-service-role-key)
- [Supabase Security: Exposed Anon Keys, RLS, and Misconfigurations](https://www.stingrai.io/blog/supabase-powerful-but-one-misconfiguration-away-from-disaster)
- [National Privacy Commission — Data Privacy Act of 2012 (RA 10173)](https://privacy.gov.ph/data-privacy-act/)
- [SMS compliance in the Philippines checklist — Kudosity](https://kudosity.com/resources/articles/sms-compliance-checklist-for-businesses-in-the-philippines-navigating-local-sms-regulations)
- [NTC — Text Scam / Spam Report](https://ntc.gov.ph/text-spam-spam-report/)
- [The Complete Guide to SMS Sender IDs in the Philippines — cast.ph](https://www.cast.ph/insights/sms-sender-id-philippines-guide-2026)
- [Semaphore SMS Philippines](https://semaphore.co/)
- [Philippines SMS API Pricing Comparison — Sent.dm](https://www.sent.dm/en/resources/sms-pricing/philippines-sms-pricing)
- [Why Your SaaS Emails Land in Spam — DMARKOFF](https://dmarkoff.com/blog/why-your-saas-emails-land-in-spam)
- [How to fix email deliverability with SPF, DKIM, and DMARC — GetSliq](https://getsliq.com/blog/email-deliverability-spf-dkim-dmarc)

**Note on confidence:** All findings above are web-sourced (MEDIUM confidence per this project's source-tier classification) rather than pulled from curated/official documentation providers, since no premium search providers (Exa/Brave/Firecrawl/Tavily) are enabled for this project. The Formspree plan-gating finding, Supabase pause behavior, and Vercel Hobby limits were cross-checked against official help/docs pages directly and are considered reasonably reliable; PH regulatory specifics (DPA fines, NTC sender ID requirements) should be re-verified against current NPC/NTC guidance before finalizing compliance-sensitive messaging features, since regulatory details can shift and this research did not consult a legal source.

---
*Pitfalls research for: TravelSentro — travel agency catalog site + admin/CRM/messaging on free-tier stack*
*Researched: 2026-07-18*
