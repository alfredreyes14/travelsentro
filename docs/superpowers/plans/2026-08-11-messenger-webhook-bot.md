# Facebook Messenger Auto-Greeting Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a visitor clicks the Facebook CTA, Messenger opens and the bot sends one auto-reply naming the package they clicked from (or a generic greeting if there's no package context), then never speaks again — staff take over manually from there.

**Architecture:** A Next.js Route Handler (`app/api/messenger/webhook/route.ts`) receives Meta's webhook events for a `messaging_referrals`/`messaging_postbacks`-with-referral click, looks up the package by the slug carried in the link's `ref` param, and sends one reply via a thin `fetch` wrapper around Meta's Graph API Send endpoint — no SDK, mirroring `lib/sms/semaphore.ts`'s existing pattern in this codebase.

**Tech Stack:** Next.js Route Handler (native `Request`/`Response`), Supabase (public-read `packages` table), Node `crypto` (webhook signature verification), `next/server`'s `after()` for non-blocking sends.

## Global Constraints

- **No unit test framework exists in this repo** (no jest/vitest — only ESLint + `tsc` + this project's own `scripts/verify-*.ts` convention: standalone `tsx` scripts with a `CheckResult[]`/PASS-FAIL console summary, `process.exit(1)` on failure). This plan follows that convention for the pure logic (link building, greeting text, signature verification) and relies on manual end-to-end testing for anything that needs a real Messenger conversation — there is no way to automate a test against Meta's live platform.
- **Greeting only, no CRM capture** (spec decision) — the bot never creates a CRM contact, never notifies staff, and never responds to anything typed after the first click-triggered message.
- **The link carries the package `slug` (a business product code), never the name.** The webhook looks the package up by slug and puts `packages.name` into the message text — the code itself is never shown to the customer.
- **Graph API version:** `v25.0` (current as of this plan; Meta's Graph API versions roughly quarterly — if a live call in Task 4 fails with a deprecated-version error, bump the version string in `lib/messenger/webhook.ts` before troubleshooting further).
- **Business Page ID:** `61567102791951` (from the existing `FACEBOOK_URL` constant in `lib/constants.ts`).
- **Env vars are server-only** (never `NEXT_PUBLIC_`-prefixed) for everything secret-bearing (`MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_VERIFY_TOKEN`) — same discipline as `RESEND_API_KEY`/`SEMAPHORE_API_KEY`.

---

### Task 1: Page username, link builder, and `FacebookCta` wiring

**Files:**
- Modify: `lib/constants.ts`
- Create: `lib/messenger/link.ts`
- Create: `scripts/verify-messenger-link.ts`
- Modify: `package.json` (add `verify:messenger-link` script)
- Modify: `components/packages/facebook-cta.tsx`
- Modify: `components/packages/sticky-cta-bar.tsx`
- Modify: `app/(public)/packages/[slug]/page.tsx`

**Interfaces:**
- Produces: `buildMessengerLink(packageSlug?: string): string` (exported from `lib/messenger/link.ts`) — used by `FacebookCta` and by Task 4's manual verification.
- Produces: `FACEBOOK_PAGE_USERNAME: string` (exported from `lib/constants.ts`).

- [ ] **Step 1: Get the Page's Messenger username (manual, one-time)**

`m.me` links need your Page's vanity username, not its numeric ID. In Facebook:
1. Go to your Page → **Settings** → **Page setup** (or **Username**, wording varies).
2. Look for a "Username" or "@name" field.
3. If one exists, tell me what it is. If there isn't one, set one now (something short and recognizable, e.g. `TravelSentroPH`) and tell me what you chose.

Tell me the username before continuing — Step 2 needs it.

- [ ] **Step 2: Add the username constant**

Add to `lib/constants.ts`, after the existing `FACEBOOK_URL` block:

```ts
// D-04 follow-up: the Page's Messenger vanity username, used to build
// m.me deep links (numeric page IDs aren't a documented m.me format).
export const FACEBOOK_PAGE_USERNAME = "<value from Step 1>";

// Numeric Page ID — same page as FACEBOOK_URL/FACEBOOK_PAGE_USERNAME,
// needed by the Graph API (which addresses the page by ID, not username)
// for both sending messages and the one-time webhook subscription call.
export const FACEBOOK_PAGE_ID = "61567102791951";
```

- [ ] **Step 3: Write `lib/messenger/link.ts`**

```ts
import { FACEBOOK_PAGE_USERNAME } from "@/lib/constants";

/**
 * Builds an m.me deep link that opens Messenger directly into a chat with
 * the Page, instead of FacebookCta's previous outbound link to the Page
 * itself (D-04 follow-up). packageSlug rides along as Messenger's `ref`
 * param -- the only mechanism m.me links have for carrying context, since
 * unlike wa.me there is no `?text=` prefill equivalent. The slug is a
 * business product code, purely an internal lookup key for the webhook
 * (app/api/messenger/webhook/route.ts) -- it is never shown to the
 * customer, who only ever sees the package's real name in the bot's reply.
 */
export function buildMessengerLink(packageSlug?: string): string {
  const base = `https://m.me/${FACEBOOK_PAGE_USERNAME}`;
  return packageSlug
    ? `${base}?ref=${encodeURIComponent(packageSlug)}`
    : base;
}
```

- [ ] **Step 4: Write `scripts/verify-messenger-link.ts`**

```ts
/**
 * Stateless proof for lib/messenger/link.ts's buildMessengerLink() --
 * no network, no secrets, mirrors scripts/verify-semaphore-error-handling.ts's
 * CheckResult/PASS-FAIL structure.
 *
 * Run via `npm run verify:messenger-link`.
 */
import { buildMessengerLink } from "../lib/messenger/link";
import { FACEBOOK_PAGE_USERNAME } from "../lib/constants";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkNoSlug(): CheckResult {
  const url = buildMessengerLink();
  const expected = `https://m.me/${FACEBOOK_PAGE_USERNAME}`;
  const pass = url === expected;
  return {
    name: "No slug -> plain page link",
    pass,
    detail: pass ? `got "${url}"` : `expected "${expected}", got "${url}"`,
  };
}

function checkWithSlug(): CheckResult {
  const url = buildMessengerLink("bali-getaway");
  const expected = `https://m.me/${FACEBOOK_PAGE_USERNAME}?ref=bali-getaway`;
  const pass = url === expected;
  return {
    name: "Slug appended as ref param",
    pass,
    detail: pass ? `got "${url}"` : `expected "${expected}", got "${url}"`,
  };
}

function checkSlugIsEncoded(): CheckResult {
  const url = buildMessengerLink("has space/slash");
  const pass = url.includes(encodeURIComponent("has space/slash"));
  return {
    name: "Slug is URL-encoded",
    pass,
    detail: pass ? `got "${url}"` : `raw slug leaked unencoded into "${url}"`,
  };
}

function main() {
  const results = [checkNoSlug(), checkWithSlug(), checkSlugIsEncoded()];

  console.log(`\nverify-messenger-link\n`);
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

- [ ] **Step 5: Add the npm script**

In `package.json`, add alongside the other `verify:*` scripts:

```json
"verify:messenger-link": "tsx scripts/verify-messenger-link.ts",
```

- [ ] **Step 6: Run it**

Run: `npm run verify:messenger-link`
Expected: `PASS: 3/3 checks passed`

- [ ] **Step 7: Update `FacebookCta`**

In `components/packages/facebook-cta.tsx`, replace the `FACEBOOK_URL` import/usage with the new link builder and add a `packageSlug` prop:

```tsx
import { buildMessengerLink } from "@/lib/messenger/link";
import { cn } from "@/lib/utils";

export function FacebookCta({
  packageName,
  packageSlug,
  variant = "icon-only",
  className,
}: {
  packageName?: string;
  packageSlug?: string;
  variant?: "icon-only" | "icon-label";
  className?: string;
}) {
  const ariaLabel = packageName
    ? `Message us about ${packageName}`
    : "Message us on Facebook";

  return (
    <a
      href={buildMessengerLink(packageSlug)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-[#1877F2]/50 focus-visible:outline-none",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.459h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.438-4.92 8.438-9.94Z" />
      </svg>
      {variant === "icon-label" && <span>Message us on Facebook</span>}
    </a>
  );
}
```

Keep the existing file-level doc comment, but update the "Outbound-only link... plain anchor" opening line to note it now opens a direct Messenger chat via `m.me` rather than the Page itself, and that `packageSlug` (not `packageName`) is what the link encodes.

- [ ] **Step 8: Thread `packageSlug` through `StickyCtaBar`**

In `components/packages/sticky-cta-bar.tsx`, add the prop and pass it through:

```tsx
export function StickyCtaBar({
  packageName,
  packageSlug,
}: {
  packageName: string;
  packageSlug: string;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-foreground/10 bg-background/95 p-3 backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <WhatsAppCta packageName={packageName} className="flex-1" />
      <FacebookCta
        packageName={packageName}
        packageSlug={packageSlug}
        className="flex-1"
      />
    </div>
  );
}
```

- [ ] **Step 9: Update the package detail page call sites**

In `app/(public)/packages/[slug]/page.tsx`, both existing call sites gain `packageSlug={pkg.slug}`:

```tsx
<FacebookCta packageName={pkg.name} packageSlug={pkg.slug} variant="icon-label" />
```

and

```tsx
<StickyCtaBar packageName={pkg.name} packageSlug={pkg.slug} />
```

(Homepage and contact page usages — `<FacebookCta variant="icon-label" />` with no package context — are unchanged; they fall through to the generic, slug-less link.)

- [ ] **Step 10: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 11: Manual browser check**

Run `npm run dev`, open a package detail page, and confirm the Facebook button's `href` (inspect element, or hover to see the status-bar URL) is `https://m.me/<your-username>?ref=<that-package's-slug>` — not the old `web.facebook.com/profile.php?...` link. Check the homepage/contact page buttons still point at a plain `https://m.me/<your-username>` with no `ref`.

- [ ] **Step 12: Commit**

```bash
git add lib/constants.ts lib/messenger/link.ts scripts/verify-messenger-link.ts package.json package-lock.json components/packages/facebook-cta.tsx components/packages/sticky-cta-bar.tsx "app/(public)/packages/[slug]/page.tsx"
git commit -m "feat: link Facebook CTA directly into Messenger via m.me"
```

---

### Task 2: Webhook pure helpers and the Send API wrapper

**Files:**
- Create: `lib/messenger/webhook.ts`
- Create: `scripts/verify-messenger-webhook.ts`
- Modify: `package.json` (add `verify:messenger-webhook` script)
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `FACEBOOK_PAGE_ID: string` from `lib/constants.ts` (added in Task 1, Step 2).
- Produces: `buildGreeting(packageName: string | null): string`, `verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean`, `sendMessengerText(recipientId: string, text: string): Promise<void>` (all exported from `lib/messenger/webhook.ts`) — consumed by Task 3's route handler.

- [ ] **Step 1: Get the App Secret and pick a verify token (manual, one-time)**

1. In the Meta App Dashboard → **App settings** → **Basic**, find **App Secret**, click "Show," and copy it.
2. I'll generate a verify token for you (a random string that just needs to match between Meta's dashboard and this app — not something you need to invent yourself): `ts-messenger-a8f3c1e9`. You'll paste this exact value into Meta's dashboard "Verify token" field in Task 4.
3. Tell me once you have the App Secret so I can add it to `.env.local`. **Paste it in a way you're comfortable with (e.g. tell me to fill it in and you type it directly into `.env.local` yourself) — I will never echo a secret back in plain conversation.**

- [ ] **Step 2: Add the new vars to `.env.local.example`**

Add after the existing `SEMAPHORE_*` block:

```
# Facebook Messenger auto-greeting bot (app/api/messenger/webhook).
# Page Access Token: Meta App Dashboard -> Messenger API Settings -> "2. Generate access tokens".
MESSENGER_PAGE_ACCESS_TOKEN=

# App Secret: Meta App Dashboard -> App settings -> Basic -> "App Secret".
# Used to verify incoming webhook requests are genuinely from Meta.
MESSENGER_APP_SECRET=

# Arbitrary string that must match the "Verify token" field entered in
# Meta App Dashboard -> Messenger API Settings -> "1. Configure webhooks".
MESSENGER_VERIFY_TOKEN=
```

Fill in `.env.local` (not committed) with the real values: the Page Access Token you already have, the App Secret from Step 1, and `MESSENGER_VERIFY_TOKEN=ts-messenger-a8f3c1e9`.

- [ ] **Step 3: Write `lib/messenger/webhook.ts`**

```ts
import crypto from "node:crypto";

import { FACEBOOK_PAGE_ID } from "@/lib/constants";

/**
 * The one auto-reply this bot ever sends -- one message per Messenger
 * click, then silence (staff take over manually). packageName is the
 * package's real display name, already resolved from the link's slug by
 * the caller (app/api/messenger/webhook/route.ts) -- this function never
 * sees the slug/product-code itself.
 */
export function buildGreeting(packageName: string | null): string {
  return packageName
    ? `Hi! Thanks for your interest in the ${packageName} package. One of our team members will get back to you shortly \u{1F60A}`
    : "Hi! Thanks for reaching out, we'll get back to you shortly \u{1F60A}";
}

/**
 * Confirms an incoming webhook POST genuinely came from Meta, per the
 * Messenger Platform's documented X-Hub-Signature-256 scheme: HMAC-SHA256
 * of the raw (unparsed) request body, keyed with the app secret. Must run
 * against the raw body string, not the parsed JSON -- re-serializing JSON
 * is not guaranteed byte-identical to what Meta signed.
 *
 * crypto.timingSafeEqual requires equal-length buffers, hence the length
 * check first -- a length mismatch is simply "not a match," not an error.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

const GRAPH_API_VERSION = "v25.0";

/**
 * Thin fetch-based Messenger Send API wrapper (server-only -- no official
 * Node SDK exists, mirrors lib/sms/semaphore.ts's callSemaphore). Reads
 * MESSENGER_PAGE_ACCESS_TOKEN internally rather than taking it as a
 * parameter, same discipline as callSemaphore reading SEMAPHORE_API_KEY.
 */
export async function sendMessengerText(
  recipientId: string,
  text: string
): Promise<void> {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Messenger is not configured: MESSENGER_PAGE_ACCESS_TOKEN is unset."
    );
  }

  const endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/${FACEBOOK_PAGE_ID}/messages?access_token=${encodeURIComponent(token)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Messenger Send API error: ${res.status} ${body}`);
  }
}
```

- [ ] **Step 4: Write `scripts/verify-messenger-webhook.ts`**

```ts
/**
 * Stateless proof for lib/messenger/webhook.ts's pure functions
 * (buildGreeting, verifySignature) -- no real network call, since
 * sendMessengerText needs a live token and a real Messenger user to send
 * to (covered instead by this plan's Task 4 manual end-to-end check).
 * Mirrors scripts/verify-semaphore-error-handling.ts's CheckResult/
 * PASS-FAIL structure.
 *
 * Run via `npm run verify:messenger-webhook`.
 */
import crypto from "node:crypto";

import { buildGreeting, verifySignature } from "../lib/messenger/webhook";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkNamedGreeting(): CheckResult {
  const text = buildGreeting("Bali Getaway");
  const pass = text.includes("Bali Getaway");
  return {
    name: "Named greeting includes package name",
    pass,
    detail: pass ? `got "${text}"` : `package name missing from "${text}"`,
  };
}

function checkGenericGreeting(): CheckResult {
  const text = buildGreeting(null);
  const pass = text.length > 0 && !text.includes("null");
  return {
    name: "Generic greeting for no package",
    pass,
    detail: pass ? `got "${text}"` : `unexpected output "${text}"`,
  };
}

function checkValidSignaturePasses(): CheckResult {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "world" });
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");
  const pass = verifySignature(body, signature, secret) === true;
  return {
    name: "Correctly-signed body passes",
    pass,
    detail: pass ? "verified" : "expected true, got false",
  };
}

function checkTamperedBodyFails(): CheckResult {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "world" });
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");
  const tamperedBody = JSON.stringify({ hello: "world!" });
  const pass = verifySignature(tamperedBody, signature, secret) === false;
  return {
    name: "Tampered body fails verification",
    pass,
    detail: pass ? "correctly rejected" : "expected false, got true",
  };
}

function checkMissingHeaderFails(): CheckResult {
  const pass = verifySignature("{}", null, "test-secret") === false;
  return {
    name: "Missing signature header fails",
    pass,
    detail: pass ? "correctly rejected" : "expected false, got true",
  };
}

function main() {
  const results = [
    checkNamedGreeting(),
    checkGenericGreeting(),
    checkValidSignaturePasses(),
    checkTamperedBodyFails(),
    checkMissingHeaderFails(),
  ];

  console.log(`\nverify-messenger-webhook\n`);
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

- [ ] **Step 5: Add the npm script**

```json
"verify:messenger-webhook": "tsx scripts/verify-messenger-webhook.ts",
```

- [ ] **Step 6: Run it**

Run: `npm run verify:messenger-webhook`
Expected: `PASS: 5/5 checks passed`

- [ ] **Step 7: Commit**

```bash
git add lib/messenger/webhook.ts scripts/verify-messenger-webhook.ts package.json package-lock.json .env.local.example
git commit -m "feat: add Messenger webhook signature verification, greeting text, and Send API wrapper"
```

---

### Task 3: The webhook route handler

**Files:**
- Create: `app/api/messenger/webhook/route.ts`

**Interfaces:**
- Consumes: `buildGreeting`, `verifySignature`, `sendMessengerText` from `lib/messenger/webhook.ts` (Task 2); `createClient` from `lib/supabase/server.ts` (existing).

- [ ] **Step 1: Write the route handler**

```ts
import { after } from "next/server";

import { buildGreeting, sendMessengerText, verifySignature } from "@/lib/messenger/webhook";
import { createClient } from "@/lib/supabase/server";

/**
 * Meta's one-time webhook verification handshake (Messenger Platform docs):
 * echo back hub.challenge only if hub.verify_token matches what's
 * configured in the Meta App Dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    token === process.env.MESSENGER_VERIFY_TOKEN
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

async function lookupPackageName(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("name")
    .eq("slug", slug)
    .eq("is_published", true)
    .is("deleted_at", null)
    .maybeSingle();

  return data?.name ?? null;
}

/**
 * Handles Messenger click/message events. Only ever reacts to the
 * referral itself (the m.me click, or -- for a visitor's very first-ever
 * interaction with the Page -- the "Get Started" postback that carries
 * the same referral data) -- never to anything typed afterward, per this
 * feature's "greeting only" scope decision. Meta requires a 200 response
 * within 5 seconds, so the actual send is deferred via after() -- ack
 * first, send second, matching app/api/inquiries/route.ts's D-02
 * discipline of never blocking the response on a side effect.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.MESSENGER_APP_SECRET;

  if (!appSecret || !verifySignature(rawBody, signature, appSecret)) {
    return new Response("Forbidden", { status: 403 });
  }

  const payload = JSON.parse(rawBody) as {
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        referral?: { ref?: string };
        postback?: { referral?: { ref?: string } };
      }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const referral = event.referral ?? event.postback?.referral;

      if (!senderId || !referral) {
        continue;
      }

      const ref = referral.ref;

      after(async () => {
        try {
          const packageName = ref ? await lookupPackageName(ref) : null;
          await sendMessengerText(senderId, buildGreeting(packageName));
        } catch (err) {
          console.error("Messenger auto-greeting failed", err);
        }
      });
    }
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual local check of the GET handshake**

Run `npm run dev`, then in another terminal:

```bash
curl "http://localhost:3000/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=ts-messenger-a8f3c1e9&hub.challenge=12345"
```

Expected: response body is exactly `12345` (matching your real `MESSENGER_VERIFY_TOKEN` from `.env.local`, adjust the token in the command if you picked something else in Task 2 Step 1). Then confirm a wrong token is rejected:

```bash
curl -i "http://localhost:3000/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"
```

Expected: `403 Forbidden`.

- [ ] **Step 4: Commit**

```bash
git add app/api/messenger/webhook/route.ts
git commit -m "feat: add Messenger webhook route handler"
```

---

### Task 4: Deploy, connect to Meta, and verify end-to-end (fully manual)

No code changes in this task — it wires up what Tasks 1–3 built.

- [ ] **Step 1: Set environment variables on Vercel**

Add `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`, and `MESSENGER_VERIFY_TOKEN` (same values as your local `.env.local`) to your Vercel project's environment variables, then deploy (preview or production — Meta's webhook needs a real HTTPS URL, `localhost` won't work).

- [ ] **Step 2: Configure the webhook in Meta's dashboard**

Back in Messenger API Settings → **"1. Configure webhooks"** (the section we left blank earlier):
- **Callback URL**: `https://<your-deployed-domain>/api/messenger/webhook`
- **Verify token**: the exact value from `MESSENGER_VERIFY_TOKEN`
- Click **Verify and save** — this should succeed now that the endpoint exists and responds correctly.
- Subscribe to the `messaging_referrals` and `messaging_postbacks` fields (not `messages` — the bot never reacts to plain typed messages, so there's no need to receive them).

- [ ] **Step 3: Subscribe the Page to the app**

One-time API call (replace `<PAGE_ACCESS_TOKEN>` with your real token):

```bash
curl -X POST "https://graph.facebook.com/v25.0/61567102791951/subscribed_apps?subscribed_fields=messaging_referrals,messaging_postbacks&access_token=<PAGE_ACCESS_TOKEN>"
```

Expected: `{"success":true}`.

- [ ] **Step 4: Enable the Get Started button**

Messenger API Settings → Messenger Profile → enable the **Get Started Button**, if not already on (required for the bot to receive the referral on a visitor's very first-ever interaction with the Page).

- [ ] **Step 5: End-to-end test — package-specific link**

As an Admin/Developer/Tester on the app (works pre-App-Review), open a package detail page on your deployed site, click the Facebook button, and confirm Messenger sends back: *"Hi! Thanks for your interest in the [package name] package. One of our team members will get back to you shortly 😊"*.

- [ ] **Step 6: End-to-end test — generic link**

From the homepage or contact page, click the Facebook button and confirm the generic greeting arrives instead: *"Hi! Thanks for reaching out, we'll get back to you shortly 😊"*.

- [ ] **Step 7: Confirm silence after the greeting**

Type a follow-up message in either conversation and confirm the bot does not reply again — only a human (you, checking the Page inbox) would respond from here.

- [ ] **Step 8: Note what's still deferred**

App Review (`pages_messaging` approval for public/non-admin use) is intentionally out of scope for this plan, per the spec's non-goals — the bot is fully built and testable now; submitting for public review is a separate later step once you're satisfied it works.
