This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Poster import (Claude vision)

The admin package screen can pre-fill a new package from a marketing poster
image. Requires:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Without it the button returns "Poster import isn't configured yet." |
| `POSTER_EXTRACTION_MODEL` | no | `claude-opus-5` | Set to `claude-haiku-4-5` for ~5x lower cost per poster, at some accuracy cost on cluttered posters. |

Roughly $0.08 (~₱4.50) per poster on the default model. The button appears
only on a package that has never been saved. Nothing is written to the
database by the import — it fills the form, and the admin saves as usual.

Verify the mapping rules offline (no API calls, no key needed):

    npm run verify:poster-extraction

Check a real poster end to end (one billed API call, needs `ANTHROPIC_API_KEY`
in `.env.local`):

    npm run verify:poster-extraction:live -- ./poster.jpg

### Package photo watermark check (Claude vision)

Every photo uploaded on the package Photos tab is checked for third-party
watermarks (stock-photo marks, photographer copyrights, other agencies'
logos or handles) before it is stored; watermarked photos are rejected with
a toast naming what was found. TravelSentro's own logo is allowed.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Shared with poster import. |
| `WATERMARK_CHECK_MODEL` | no | `claude-opus-5-5` | Must accept `output_config.effort` (so not `claude-haiku-4-5`). |

The check fails open: if it can't run (no key, out of credits, API error),
the photo uploads anyway and the reason is logged server-side.

### Lead follow-ups (email + SMS)

Follow-ups nudge B2C leads back into a chat. A follow-up is not a stage:
it's something the system does *at* a stage. The B2C funnel stays
New → Inquiry → Quotation → Confirmation / Lost.

| Sequence | Runs while the lead is at | Angles (one per follow-up) | A tap on the chat button |
|---|---|---|---|
| **No reply yet** | New | group size & dates · dates fill up · help choosing · last check-in | moves them to **Inquiry** |
| **Quote follow-up** | Quotation | send passport copies to reserve · slots are limited · questions before booking · last check-in | stops the emails; they stay at **Quotation** |

- **Schedule:** gaps of 1, 3, 5 and 10 days from the previous follow-up
  (counting from when the lead entered the stage), so day 1, 4, 9 and 19.
  3 days after the 4th with no tap, the lead moves to **Lost** (shown on
  Activity). A tap on an old link brings a Lost lead back.
- **Counting:** only follow-ups sent since the lead entered its current
  stage count, so moving a lead (e.g. New → Quotation) starts the next
  sequence fresh.
- **Links:** each email has "Chat with us on Messenger" and "Chat on
  WhatsApp" buttons; each text a Messenger link. Every link is personal
  (`/go/<token>`), so a tap is logged on the contact's Activity.
- **Badges:** "Following up 2 of 4", "All 4 follow-ups sent" or "Clicked to
  chat" next to the stage, in the CRM list and on the contact.
- **By hand:** "Follow Up" on a contact, or "Follow Up Selected" in the CRM
  list (each lead gets their own next message unless staff write one).
  These count toward the 4; after the 4th, extra angles take turns.
  Staff can follow up B2B contacts too (New/Contacted → Follow-up, a tap →
  Discovery); there's no automation for B2B.
- **Automatic:** daily cron at 01:07 UTC (9:07 AM Manila), B2C only, emails
  only. On by default; `FOLLOW_UPS_ENABLED=false` stops it. Limits:
  `.env.local.example`. Copy and cadence: `lib/follow-ups/templates.ts`.
- **Keep stages current:** the CRM can't see Messenger chats. A lead staff
  are chatting with but left at New still gets "No reply yet" emails.
- **SMS caveat:** Philippine telcos filter texts with links. Semaphore's A2P
  route delivers them with a registered sender name (`SEMAPHORE_SENDER_NAME`);
  never use link shorteners (Smart drops them). Test on Globe and Smart
  numbers before relying on it.

Verify the link/template logic offline: `npm run verify:follow-ups`.

### CRM ↔ Meta stage sync

Code: `lib/meta-sync`. Database: `supabase/migrations/20261116120000_meta_stage_sync.sql`.

- **Messenger inbox labels ↔ CRM stage.** Each Messenger chat can be
  linked to a contact:
  - automatically, when the lead's email or phone appears in the chat (the
    lead form's first message has both);
  - automatically, when they tap "Chat on Messenger" in a follow-up;
  - by hand, from "Messenger chat" on the contact page.

  Once linked:
  - a stage label staff put on the chat ("New lead", "Inquiry",
    "Quotation", "Confirmation", "Lost"; B2B: "Contacted", "Follow-up", …)
    sets the CRM stage;
  - a CRM stage change puts the matching label on the chat (one stage label
    at a time);
  - a linked lead who writes again moves from New/Lost to Inquiry.
- **CRM stage → Meta Ads (Conversions API for CRM).** Each stage a Meta
  lead-ad lead reaches is sent with its lead ID, so Meta can show ads to
  people like the ones who book.
- **How it runs:**
  - Database triggers queue jobs in `meta_outbox`.
  - The app sends them right after a change (and from the daily crons).
  - Parts that aren't configured are skipped.
- **Setup:**
  - env vars in `.env.local.example`;
  - `npm run setup:meta-sync` once (webhook fields and inbox labels).
- **Real customers:** Messenger webhooks and labels only work for real
  customers once the Meta app has Advanced Access to `pages_messaging`
  (App Review).

Verify offline: `npm run verify:meta-sync`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
