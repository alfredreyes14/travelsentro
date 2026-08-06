# Phase 4: Customer Messaging (Email & SMS) - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 14
**Analogs found:** 12 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `actions/messages.ts` | controller (Server Action) | request-response | `actions/crm.ts` | exact |
| `lib/sms/semaphore.ts` | service (external API wrapper) | request-response | `lib/resend.ts` | role-match (email client analog; no SMS precedent exists) |
| `lib/resend.ts` (extend: `sendBatchEmails()`) | service | batch | `lib/resend.ts` (self) + `app/api/inquiries/route.ts`'s `resend.emails.send()` call | exact (extension of existing file) |
| `lib/unsubscribe-token.ts` | utility | transform | none (greenfield — Node `crypto` stdlib only) | no analog |
| `lib/crm/messages.ts` (channel/status enums, `{{name}}` helper) | utility (shared constants) | transform | `lib/crm/status.ts` | exact |
| `supabase/migrations/<ts>_add_messaging_schema.sql` | migration | CRUD | `supabase/migrations/20260720121436_create_crm_schema.sql` + `20260720130816_fix_crm_schema_review_findings.sql` | exact |
| `app/unsubscribe/page.tsx` | page (Server Component, public/unauthenticated) | request-response | `app/admin/(dashboard)/crm/[id]/page.tsx` (data-op-before-render Server Component shape); `app/api/inquiries/route.ts` (public write-surface RLS/RPC pattern, not the Route Handler shape itself) | role-match (public write-surface pattern; renders HTML directly rather than JSON — see 04-04-PLAN.md's "Routing decision" callout for why a Route Handler was rejected) |
| `components/admin/crm-table.tsx` (modify: row-selection + bulk bar) | component | CRUD (client state) | `components/admin/crm-table.tsx` (self, existing) | exact |
| `components/admin/crm-detail.tsx` (modify: Message entry point, opt-out toggle, merged Activity timeline) | component | CRUD | `components/admin/crm-detail.tsx` (self, existing) | exact |
| `components/admin/message-compose-dialog.tsx` | component | request-response | `components/admin/contact-edit-form.tsx` (Dialog shell) + `components/admin/crm-detail.tsx` (Select/Switch async pattern) | role-match |
| `components/email/customer-message-email.tsx` | component (React Email template) | transform | `components/email/auto-reply-email.tsx` | exact |
| `lib/auth/dal.ts` | middleware (no change — reused as-is) | request-response | `lib/auth/dal.ts` (self, unchanged) | exact (reuse, not modified) |
| `lib/action-result.ts` | utility (no change — reused as-is) | transform | `lib/action-result.ts` (self, unchanged) | exact (reuse, not modified) |
| `app/admin/(dashboard)/crm/[id]/page.tsx` (modify: fetch + merge `messages` into timeline) | route/page (Server Component) | CRUD | same file (existing, Phase 3) | exact |

## Pattern Assignments

### `actions/messages.ts` (controller, request-response)

**Analog:** `actions/crm.ts` (full file, 55 lines — read in full above)

**Imports pattern** (lines 1-8):
```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { ContactStatus } from "@/lib/crm/status";
```
New file swaps the last import for `lib/crm/messages.ts` types and adds `lib/resend.ts`, `lib/sms/semaphore.ts` imports.

**Auth + core pattern** (lines 15-34, `updateStatus`):
```typescript
export async function updateStatus(
  id: string,
  status: ContactStatus
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { ok: false, error: STATUS_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}
```
New send actions (`sendIndividualEmail`, `sendIndividualSms`, `sendBulkEmail`, `sendBulkSms`, `updateOptOut`) follow this exact shape: `requirePermission("can_message_customers")` first (per 04-CONTEXT.md's Claude's-Discretion note — NOT `can_edit_crm`, except `updateOptOut` which stays on `can_edit_crm` since it's a contact-record edit), then Supabase/provider call, then `ActionResult` return, then `revalidatePath`.

**Critical deviation from this analog (Pitfall 4, 04-RESEARCH.md):** unlike `updateStatus`'s single DB `.update()`, the new send actions must `await` the Resend/Semaphore provider call **inline**, never via `after()` (see `app/api/inquiries/route.ts`'s `after()` pattern below — explicitly NOT to be copied for user-initiated sends). On provider failure, return `{ ok: false, error: "Couldn't send the email/text. Please try again." }` per the UI-SPEC's failure-toast copy — do not silently log-and-continue.

**Error handling pattern:** identical `{ ok: false, error: STRING_CONSTANT }` shape as `CONTACT_ERROR_MESSAGE`/`STATUS_ERROR_MESSAGE` — define new top-of-file constants (e.g. `SEND_ERROR_MESSAGE`, `OPT_OUT_ERROR_MESSAGE`) matching this file's existing convention (lines 10-13).

---

### `lib/sms/semaphore.ts` (service, request-response)

**Analog:** `lib/resend.ts` (full file, 30 lines) — closest existing "server-only external API client" pattern, though Semaphore has no SDK so this is a `fetch` wrapper, not a client singleton.

**Pattern to copy — module-level safety comment + env var fallback discipline** (lines 3-24 of `lib/resend.ts`):
```typescript
import { Resend } from "resend";

/**
 * Resend client factory singleton (server-only). ...
 * Safe because this module is never imported into a "use client" module ...
 */
export const resend = new Resend(
  process.env.RESEND_API_KEY || "re_unconfigured_placeholder"
);
```
`lib/sms/semaphore.ts` should carry the same "server-only, never imported client-side" doc comment discipline, and read `SEMAPHORE_API_KEY`/`SEMAPHORE_SENDER_NAME` from `process.env` the same way (no placeholder fallback needed here since it's a per-call `fetch`, not a constructor that throws at import time).

**Concrete implementation** (already fully specified in 04-RESEARCH.md's Code Examples — use verbatim as the starting point, cross-checked against a real Semaphore account per Pitfall 3/Open Question 3 before finalizing):
```typescript
const SEMAPHORE_ENDPOINT = "https://semaphore.co/api/v4/messages";

async function callSemaphore(numbers: string[], message: string) {
  const body = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY!,
    number: numbers.join(","),
    message,
    sendername: process.env.SEMAPHORE_SENDER_NAME ?? "",
  });
  const res = await fetch(SEMAPHORE_ENDPOINT, { method: "POST", body });
  if (!res.ok) throw new Error(`Semaphore API error: ${res.status}`);
  return await res.json();
}

export async function sendSingleSms(number: string, message: string) { /* ... */ }
export async function sendBulkSms(numbers: string[], message: string) { /* ... */ }
```

---

### `lib/resend.ts` (extend with `sendBatchEmails()`)

**Analog:** self (existing `resend`/`FROM_EMAIL` exports) + `app/api/inquiries/route.ts`'s `resend.emails.send()` call site (lines 81-95) for the send-and-check-`result.error` pattern.

**Core pattern to extend with:**
```typescript
// app/api/inquiries/route.ts lines 81-95 — the "await send, check result.error" shape
const result = await resend.emails.send({
  from: FROM_EMAIL,
  to: parsed.data.email,
  subject: "We got your inquiry!",
  react: createElement(AutoReplyEmail, { name, packageName }),
});
if (result.error) {
  console.error("Auto-reply email failed", result.error);
}
```
New `sendBatchEmails()` helper in `lib/resend.ts` follows the same `from`/`to`/`react` shape but calls `resend.batch.send(chunk)` per 04-RESEARCH.md's Pattern 3 (chunked to ≤100/call), and — per Pitfall 4 — the caller (`actions/messages.ts`) must inspect the per-item result and write one `messages` row per recipient with `status: 'sent' | 'failed'`, not swallow errors like the inquiry route's fire-and-forget block does.

---

### `lib/crm/messages.ts` (utility, shared constants)

**Analog:** `lib/crm/status.ts` (full file, 36 lines)

**Pattern to copy exactly** (enum + label map + badge-variant map shape):
```typescript
export const CONTACT_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const STATUS_LABELS: Record<ContactStatus, string> = { /* ... */ };
export const STATUS_BADGE_VARIANT: Record<ContactStatus, "default"|"outline"|"secondary"|"destructive"> = { /* ... */ };
```
New file mirrors this exactly for `MESSAGE_CHANNELS = ["email", "sms"] as const`, `MESSAGE_STATUSES = ["sent", "failed"] as const`, plus a new `applyNameTemplate(body: string, name: string): string` helper (`body.replaceAll("{{name}}", name)`) for the bulk-email `{{name}}` merge-tag feature (04-RESEARCH.md Pattern 3, Code Examples).

---

### `supabase/migrations/<timestamp>_add_messaging_schema.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260720121436_create_crm_schema.sql` (SECURITY DEFINER RPC + RLS conventions) and `20260720130816_fix_crm_schema_review_findings.sql` (CR-03's "no broad anon RLS policy" fix — the specific precedent this migration must not repeat).

**Pattern to copy — SECURITY DEFINER RPC as sole anon write path** (exact SQL given in 04-RESEARCH.md, reproduced verbatim as this migration's starting point):
```sql
create or replace function public.set_contact_opted_out(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts set opted_out = true where id = p_contact_id;
end;
$$;

grant execute on function public.set_contact_opted_out(uuid) to anon, authenticated;
-- No RLS UPDATE policy for anon is added anywhere -- this RPC is the only write path.
```

**Pattern to copy — RLS read/write split** (mirrors `contacts`/`inquiries` policies from `20260720121436_create_crm_schema.sql`):
```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  subject text,
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_message_id text,
  batch_id uuid,
  sent_by uuid references profiles(id),
  sent_by_name text,
  created_at timestamptz not null default now()
);
alter table messages enable row level security;

create policy "authenticated staff can read all messages" on messages
  for select to authenticated using (true);

create policy "can_message_customers can insert messages" on messages
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_message_customers'));
-- No update/delete policy -- immutable append-only log, same as inquiries.
```
Note: unlike `record_inquiry()`, the `messages` INSERT does NOT need its own RPC — every send originates from an authenticated Server Action already gated by `requirePermission`, so a direct authenticated-role RLS INSERT policy (checked via `has_permission()`, the same SQL function `requirePermission()` calls) is sufficient and matches the "RPC only for the one truly anonymous write" principle.

---

### `app/unsubscribe/page.tsx` (Server Component page, public/unauthenticated)

**Analog:** `app/admin/(dashboard)/crm/[id]/page.tsx` for the "async Server Component performs a data operation before rendering" shape (there: a `select`; here: a conditional `rpc` call), and `app/api/inquiries/route.ts` for the underlying "verify input, call a narrow SECURITY DEFINER RPC, never grant a broad anon RLS write policy" write-surface discipline — but NOT for its Route Handler shape. 04-04-PLAN.md's own "Routing decision" callout explains why: this endpoint's entire job is rendering visible HTML (a confirmation/invalid-link card) for a human who clicked an email link, not responding to a `fetch()` call — a Route Handler would need to hand-construct an HTML `Response` string, which has no precedent anywhere in this all-React-Server-Component codebase.

**Pattern actually used — parse query params, verify signature, conditionally call RPC, render:**
```typescript
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ cid?: string; sig?: string }> }) {
  const { cid, sig } = await searchParams;
  const isValid = Boolean(cid && sig && verifyContactId(cid, sig));
  if (isValid) {
    const supabase = await createClient();
    await supabase.rpc("set_contact_opted_out", { p_contact_id: cid });
  }
  return (/* single centered confirmation/invalid-link card, no admin chrome */);
}
```
The RPC call happens ONLY when `isValid` is true — never call it with an unverified `cid`. Unlike `app/api/inquiries/route.ts`, this page has no `after()`-scheduled best-effort side effects — it's a single synchronous RPC call gated by signature verification, then a direct render.

**Explicit anti-pattern flagged by RESEARCH.md:** do not add an `anon` RLS `UPDATE` policy on `contacts` (the thing CR-03 already had to remove) — the RPC is the only write path, exactly as `record_inquiry()` already established.

---

### `components/admin/crm-table.tsx` (modify: row-selection + bulk bar)

**Analog:** self (existing file, full 230 lines read above) — this is a modification, not a new file.

**Pattern to extend — TanStack Table `ColumnDef` array** (lines 54-108, e.g. the `tags` column as a template for a new leading `select` column):
```typescript
{
  id: "tags",
  header: "Tags",
  cell: ({ row }) => (
    <div className="flex flex-wrap gap-1">
      {row.original.tags.map((tag) => (
        <Badge key={tag} variant="outline">{tag}</Badge>
      ))}
    </div>
  ),
},
```
New leading `select` column follows this `{ id, header, cell }` shape, using `Checkbox` (new shadcn component) bound to `row.getIsSelected()`/`row.getToggleSelectedHandler()`, disabled + `Tooltip`-wrapped when `row.original.opted_out` per UI-SPEC's interaction notes. Add `rowSelection` to the `useReactTable` state object (line 118, alongside existing `globalFilter`/`columnFilters`) and `onRowSelectionChange`.

**Row click handler already present** (lines 212-223) — the new checkbox cell must call `e.stopPropagation()` in its `onClick` so it doesn't also trigger the existing `router.push(...)` row-click navigation, per UI-SPEC's interaction notes.

**New bulk-selection bar:** insert between the existing search/filter `div` (lines 147-177) and the table markup (lines 179-227) — no existing analog in this file; build using `Button` (`variant="ghost"` for Clear, default variant for "Message Selected") matching this file's existing `Button variant="secondary"` usage (line 187) for visual consistency.

---

### `components/admin/crm-detail.tsx` (modify: Message entry point, opt-out toggle, merged Activity timeline)

**Analog:** self (existing file, full 252 lines read above) — this is a modification, not a new file.

**Pattern to copy — optimistic-update-with-revert async Server Action call** (lines 81-96, `handleStatusChange`):
```typescript
function handleStatusChange(newStatus: ContactStatus) {
  const previous = status;
  setStatus(newStatus);
  startTransition(async () => {
    try {
      const result = await updateStatus(contact.id, newStatus);
      if (!result.ok) {
        toast.error(result.error);
        setStatus(previous);
      }
    } catch {
      toast.error(STATUS_ERROR_MESSAGE);
      setStatus(previous);
    }
  });
}
```
The new opt-out `Switch` toggle's `handleOptOutChange` follows this exact optimistic-set/await/revert-on-failure shape, calling a new `updateOptOut()` action instead of `updateStatus()`.

**Pattern to copy — Dialog-wrapped form entry point** (lines 158-176, "Edit Contact" dialog):
```tsx
<Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
  <DialogTrigger render={<Button variant="secondary" size="sm" />}>
    Edit Contact
  </DialogTrigger>
  <DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
    <ContactEditForm contact={contact} onSuccess={() => { setIsEditOpen(false); router.refresh(); }} />
  </DialogContent>
</Dialog>
```
The new "Message" button + `MessageComposeDialog` entry point follows this identical open-state/`DialogTrigger`/`onSuccess: () => { close(); router.refresh(); }` shape (per UI-SPEC: `Button` with `SendIcon` leading, accent-styled per Color contract).

**Pattern to extend — timeline rendering** (lines 205-248, inquiry `<ol>` list):
```tsx
<ol className="flex flex-col gap-6">
  {inquiries.map((inquiry) => (
    <li key={inquiry.id} className="border-l-2 border-border pl-4">
      <div className="flex flex-col gap-1">
        <Tooltip>
          <TooltipTrigger render={<span className="w-fit text-sm font-semibold text-muted-foreground" />}>
            {formatDistanceToNow(new Date(inquiry.created_at), { addSuffix: true })}
          </TooltipTrigger>
          <TooltipContent>{format(new Date(inquiry.created_at), "MMM d, yyyy h:mm a")}</TooltipContent>
        </Tooltip>
        <p className="text-base leading-[1.5]">{inquiry.message}</p>
        {/* package badge or "General inquiry" */}
      </div>
    </li>
  ))}
</ol>
```
"Activity" (renamed from "Inquiry History", line 202) merges `inquiries` and a new `messages` prop into one array sorted by `created_at` before rendering; each `<li>` keeps the exact `border-l-2 border-border pl-4` shell and `Tooltip`/`format`/`formatDistanceToNow` timestamp mechanism, branching only the inner content (message text vs. channel icon + subject/body + "Failed to send" badge + "Sent by {name}" caption) based on an item-type discriminant.

---

### `components/admin/message-compose-dialog.tsx` (new component)

**Analog:** `components/admin/crm-detail.tsx`'s Dialog + Select/Switch async-submit pattern (see above) for the shell and submit-state handling; no existing multi-tab form to copy from directly — this is the phase's one largely-greenfield component, built from established primitives (`Dialog`, `Tabs`, `Textarea`, `AlertDialog` — all already installed per UI-SPEC Registry Safety).

**Pattern to copy — loading/disabled submit state during an awaited Server Action** (same shape as `handleStatusChange`'s `isPending`/`startTransition`, lines 78 and 84-96 of `crm-detail.tsx`): disable submit button and show "Sending..." (per UI-SPEC copy) while the `sendIndividualEmail`/`sendBulkEmail` etc. call is in flight; on success, close dialog + `router.refresh()`; on failure, keep dialog open + `toast.error(...)` + re-enable submit — mirrors `crm-detail.tsx`'s revert-on-failure discipline but keeps the dialog open instead of reverting local state (per UI-SPEC's interaction notes).

---

### `components/email/customer-message-email.tsx` (new React Email template)

**Analog:** `components/email/auto-reply-email.tsx` (full file, 60 lines)

**Pattern to copy exactly** (react-email component shape, inline-style brand tokens, `export default`):
```tsx
import { Body, Container, Head, Heading, Html, Preview, Text } from "react-email";

export function CustomerMessageEmail({ name, body }: { name: string; body: string }) {
  return (
    <Html>
      <Head />
      <Preview>{/* first line of body or a generic preview */}</Preview>
      <Body style={{ backgroundColor: "#FAF7F2", fontFamily: "sans-serif" }}>
        <Container style={{ backgroundColor: "#FFFFFF", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ color: "#021F4A", fontSize: "24px" }}>Hi {name},</Heading>
          <Text style={{ color: "#021F4A", fontSize: "16px" }}>{body}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CustomerMessageEmail;
```
Same navy/marigold/sand inline-style tokens, same `Preview`/`Heading`/`Text` component set, same "kept visually simple, no pixel-level contract" scope note carried over from 03-UI-SPEC (reaffirmed in 04-UI-SPEC's Scope Note). No new email-brand styling to invent.

## Shared Patterns

### Server Action permission gating
**Source:** `lib/auth/dal.ts` (`requirePermission`), used identically in `actions/crm.ts` lines 19, 40
**Apply to:** Every function in `actions/messages.ts` — send actions gate on `can_message_customers`, `updateOptOut` gates on `can_edit_crm` (per 04-CONTEXT.md's explicit Claude's-Discretion note distinguishing the two).
```typescript
await requirePermission("can_message_customers");
```
Note: `Permission` type in `lib/auth/dal.ts` (line 11-14) already includes `"can_message_customers"` — no DAL changes needed this phase, reuse as-is.

### ActionResult return shape
**Source:** `lib/action-result.ts` (5 lines, unchanged) — `export type ActionResult = { ok: true } | { ok: false; error: string };`
**Apply to:** Every new function in `actions/messages.ts` (individual/bulk send, opt-out toggle).

### Best-effort vs. must-surface failure handling — the one deliberate deviation
**Source:** `app/api/inquiries/route.ts` lines 79-96 (auto-reply, `after()`-scheduled, try/catch-and-log) vs. what to build instead.
**Apply to:** All new send actions must NOT copy the `after()` fire-and-forget pattern — await inline and return `ActionResult` failure, per Pitfall 4. This is a documented anti-pattern for this phase specifically, called out in both 04-RESEARCH.md and 04-CONTEXT.md's code_context section.

### Shared constants/labels module
**Source:** `lib/crm/status.ts` (36 lines, full pattern) — enum array + label `Record` + variant `Record`.
**Apply to:** `lib/crm/messages.ts` (channel/status enums, badge variants, `{{name}}` template helper).

### SECURITY DEFINER RPC for the sole anonymous write
**Source:** `supabase/migrations/20260720121436_create_crm_schema.sql` (`record_inquiry()`) + `20260720130816_fix_crm_schema_review_findings.sql` (CR-03 removal of the broad anon RLS policy).
**Apply to:** `set_contact_opted_out()` RPC + `app/unsubscribe/page.tsx`'s pre-write HMAC verification.

### React Email template shell
**Source:** `components/email/auto-reply-email.tsx` — brand-token inline styles, `Html`/`Head`/`Preview`/`Body`/`Container`/`Heading`/`Text` component set.
**Apply to:** `components/email/customer-message-email.tsx`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/unsubscribe-token.ts` | utility | transform | No prior signed-token/crypto usage exists in this codebase; use 04-RESEARCH.md's Pattern 2 code example (Node `crypto.createHmac`/`timingSafeEqual`) directly — it is already fully specified and cited against Node.js docs. |
| `components/admin/message-compose-dialog.tsx` (Tabs-based multi-channel form specifically) | component | request-response | No existing multi-tab compose form in the codebase; assembled from `Dialog` + `Tabs` + `Textarea` + `AlertDialog` primitives per UI-SPEC, using `crm-detail.tsx`'s async-submit discipline as the closest behavioral (not structural) analog — see Pattern Assignments above. |

## Metadata

**Analog search scope:** `actions/`, `lib/`, `lib/crm/`, `lib/auth/`, `components/admin/`, `components/email/`, `app/api/`, `supabase/migrations/`
**Files scanned:** 11 existing files read in full (all ≤ 252 lines, single-pass reads, no re-reads)
**Pattern extraction date:** 2026-07-24
