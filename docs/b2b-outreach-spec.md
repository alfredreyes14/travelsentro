# B2B Outreach & Follow-up Sequences — Spec

Status: Draft (not started)
Date: 2026-10-29

## 1. Goal

1. **B2B outreach:** find B2B companies that could book group/corporate travel, email them, follow up automatically, and move them through the B2B funnel.
2. **Shared follow-up engine:** the sequence/follow-up system works for both B2B and B2C. Example B2C use: follow up a customer 2 days after sending a quotation.

All with minimal monthly cost.

## 2. Decisions

| Topic | Decision |
|---|---|
| Lead source | Apollo first (free tier). Switch to Google Places (free quota) when Apollo stops paying off. |
| Sending domain | Separate domain (e.g. `travelsentro-trips.com`). Never `travelsentro.com`. |
| Sending method | Our own sender using Gmail API from a Google Workspace inbox. Not Resend (its terms ban cold email). |
| Scheduler | Supabase `pg_cron` (hourly, free) calling a secured app route. |
| Replies | Land in the Workspace Gmail inbox. Staff reply from Gmail. System reads them and updates the CRM. |
| SMS | Not used for cold outreach. |
| Human check | Every cold first email is approved by staff before sending. Warm sequences (e.g. B2C quote follow-up) can skip approval — a per-sequence setting. |
| Follow-up engine | One shared engine for B2B and B2C. Audience, trigger, sender, and stage moves are set per sequence — nothing hardcoded to B2B. |
| Cold vs warm | Cold outreach (people who never contacted us) is B2B only and always uses the separate domain. B2C sequences are warm only (people who inquired) and may use the main domain. |

## 3. Out of scope (for now)

- Replying to emails from inside the CRM
- Open/click tracking
- Multiple inboxes per sequence / inbox rotation
- SMS steps (design leaves room via a `channel` field; build later)
- Cold outreach to B2C (individuals)
- LinkedIn or any scraping that breaks a site's terms

## 4. What already exists

- `contacts.client_type` (`b2c` / `b2b`) and `contacts.stage`
- B2B stages: `new → contacted → follow_up → discovery → contract_review → won / lost` (`lib/crm/stage.ts`)
- `contacts.opted_out` + `set_contact_opted_out()` + public unsubscribe page
- `messages` table (sent message log)

## 5. Sequences (shared engine)

Each sequence defines:

| Setting | Options / example |
|---|---|
| Audience | `b2b` or `b2c` |
| Type | `cold` (B2B only) or `warm` |
| Trigger | Manual enroll · On lead import · On entering a stage (e.g. B2C enters `quotation`) |
| Sender inbox | Any connected inbox (outreach domain for cold; main domain allowed for warm) |
| Steps | Day offset, subject/body template, channel (`email` now, `sms` later) |
| Stage on send | Optional per step (e.g. step 1 → `contacted`) |
| Reply → stage map | Per reply type (see §8) |
| Stop when | Reply · Opt-out · Bounce · Contact's stage changes manually · Stage reaches a set value |
| Needs approval | Yes / No |

Stage values are checked against the audience's pipeline in `lib/crm/stage.ts`.

**Starter sequence (built now)**

| Sequence | Audience | Trigger | Steps |
|---|---|---|---|
| B2B cold outreach | b2b, cold | On lead import (after approval) | Day 0, 3, 7 |

**Possible B2C sequences (not built — examples the engine must support)**

| Sequence | Audience | Trigger | Steps |
|---|---|---|---|
| B2C quotation follow-up | b2c, warm | Enters `quotation` | Day 2, 5 |
| B2C inquiry nudge | b2c, warm | Enters `inquiry` (stops when moved to `quotation`) | Day 1, 4 |

B2C readiness = no B2B-only assumptions in the engine, schema, or editor. A B2C sequence can be created later from the editor with no code changes.

## 6. B2B user flow

1. Admin imports leads (Apollo API or CSV) → B2B contacts at stage **New**.
2. AI scores each lead (1–5 + reason) and drafts a first email for good fits.
3. Admin reviews drafts → approve / edit / skip.
4. Approved leads are enrolled in the sequence.
5. Scheduler sends step 1 → stage **Contacted**.
6. No reply → step 2 on day 3 → stage **Follow-up**; step 3 on day 7.
7. Reply arrives → AI classifies it → system acts (see §7).
8. Team gets an alert and replies from Gmail.

## 7. Sending rules

Cold-only rules are marked *(cold)*. Warm sequences use the rest.

- Weekdays only, 9:00–17:00 Asia/Manila.
- Daily cap per inbox ramps: start 5/day, +5 per week, max 30/day *(cold)*.
- Random 2–6 min gap between sends *(cold)*.
- Every email: plain text, sender's name and company, unsubscribe link. Cold emails also say how we found them.
- Never send to: `opted_out = true`, bounced emails, contacts already in an active sequence.
- A contact can be in only one active sequence at a time.
- Auto-pause the inbox if bounce rate > 5% (last 50 sends) or any spam complaint.

## 8. Reply handling

Connected inboxes are checked hourly for new messages in tracked threads. AI sorts each reply; the sequence's reply → stage map decides the stage.

| Reply type (AI) | Always | B2B default stage | B2C default stage |
|---|---|---|---|
| Interested | Stop sequence, alert team | `discovery` | no change (staff decides) |
| Not interested | Stop sequence | `lost` | `lost` |
| Unsubscribe | Stop sequence, `opted_out = true` | — | — |
| Out of office | Keep sequence running | — | — |
| Bounce | Stop sequence, mark email bad | — | — |
| Unclear | Stop sequence, alert team | — | — |

Every reply is saved on the contact's timeline.

## 9. Data model changes

**`contacts` (new columns)**
- `lead_source` — `apollo` / `google_places` / `manual`
- `lead_source_ref` — ID from the source (for de-duping)
- `company_domain` — for de-duping
- `fit_score` (1–5), `fit_reason`
- `email_status` — `unknown` / `valid` / `bounced`

**New tables**
Tables use a neutral `sequence_` prefix (not "outreach") since they serve B2B and B2C.

- `sequence_inboxes` — email address, domain kind (`outreach` / `main`), OAuth refresh token (encrypted), daily cap, ramp start date, paused flag
- `sequences` — name, audience (`b2b`/`b2c`), type (`cold`/`warm`), trigger (`manual` / `on_import` / `on_stage`), trigger stage, inbox, needs approval, stop-at stage, reply → stage map (JSON), active flag
- `sequence_steps` — sequence, step number, day offset, channel (`email`; `sms` later), subject/body template, stage on send (optional)
- `sequence_enrollments` — contact, sequence, current step, next send time, status (`draft` / `approved` / `active` / `stopped` / `completed`), stop reason, thread ID, approved draft text
- `sequence_events` — enrollment, type (`sent` / `reply` / `bounce` / `unsubscribe`), message ID, AI classification, raw snippet, timestamp

Rules enforced in DB: one active enrollment per contact; `cold` sequences require audience `b2b`.

All tables: RLS, admin/staff with "message customers" permission only.

## 10. Lead source design

One interface, two adapters:

```ts
interface LeadSource {
  search(query: LeadQuery): Promise<Lead[]>;
}
// adapters: apolloSource, googlePlacesSource
```

Active source is a setting. Results page compares reply rate by `lead_source`.

## 11. Results page

Per sequence, per lead source, and per week: sent, replied, interested, bounced, unsubscribed, reply rate.

## 12. Costs (monthly)

| Item | Cost |
|---|---|
| Separate domain | ~$1 |
| Google Workspace inbox | ~$7–8 |
| AI (scoring, drafts, reply sorting) | a few dollars |
| Apollo | $0 (free tier) |
| Google Places | $0 (within free quota) |

## 13. Legal (PH Data Privacy Act)

- Cold outreach: business contacts only, B2B purpose only.
- B2C: only people who contacted us first (warm).
- Each email says who we are; cold emails also say how we found them.
- Clear opt-out; opt-outs are permanent and apply to all sequences.
- No bought email lists.

## 14. Open questions

- [ ] Does Apollo's free plan allow API access, or CSV only?
- [ ] Which industries / company sizes to target first?
- [ ] Who receives "interested" alerts (email address)?
- [ ] Final sending domain name and inbox name.
- [x] Is `travelsentro.com` on Google Workspace? **Yes** — warm B2C sequences can send from the main domain via Gmail.
- [x] Which B2C follow-ups to start with? **None for now.** Engine stays B2C-ready; no B2C sequences are built or seeded.

---

## Checklist

### Phase 0 — Setup (owner: business)
- [ ] Buy separate domain
- [ ] Add domain to Google Workspace, create 1 inbox
- [ ] Add SPF, DKIM, DMARC records
- [ ] Redirect the new domain's website to `travelsentro.com`
- [ ] Create Google Cloud project, enable Gmail API, set up OAuth
- [ ] Create Apollo account
- [ ] Start manual inbox warm-up (2–3 weeks)

### Phase 1 — Lead import
- [ ] Migration: new `contacts` columns
- [ ] `LeadSource` interface + Apollo adapter (API or CSV import)
- [ ] De-dupe by `lead_source_ref`, email, and `company_domain`
- [ ] Skip opted-out contacts
- [ ] Admin "Import leads" screen

### Phase 2 — AI scoring & drafts
- [ ] Fit scoring (score + reason)
- [ ] First-email draft generation
- [ ] Draft approval queue (approve / edit / skip)

### Phase 3 — Shared sequence engine
- [ ] Migration: `sequence_*` tables + RLS + DB rules
- [ ] Gmail OAuth connect for inboxes
- [ ] Sequence editor (audience, type, trigger, inbox, steps, stage moves, reply map)
- [ ] Stage values validated against the audience's pipeline
- [ ] Triggers: manual, on import, on entering a stage
- [ ] `pg_cron` hourly job → secured send route
- [ ] Send window, daily cap + ramp, random gaps (cold)
- [ ] Unsubscribe link (reuse existing page)
- [ ] Log sends; apply per-step stage moves
- [ ] Stop conditions (reply, opt-out, bounce, manual stage change, stop-at stage)
- [ ] Auto-pause on high bounces
- [ ] Seed starter sequence: B2B cold outreach
- [ ] Connect main-domain inbox (`travelsentro.com` Workspace) as an option for warm sequences
- [ ] Test: a B2C warm sequence can be created and run from the editor (test data only, not seeded)

### Phase 4 — Replies & funnel
- [ ] Hourly Gmail check for replies and bounces
- [ ] AI reply classification
- [ ] Actions per reply type, using each sequence's reply → stage map (§8)
- [ ] Reply on contact timeline
- [ ] Team alert email

### Phase 5 — Results page
- [ ] Stats by sequence, lead source, and week

### Phase 6 — Google Places (later)
- [ ] Google Places adapter
- [ ] Website crawler for public contact emails
- [ ] Source switch setting
