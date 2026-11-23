import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { MessengerPhrases, type StagePhrase } from "@/components/admin/messenger-phrases";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleOrRedirect } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { isMetaLeadSyncEnabled } from "@/lib/meta-leads/run-sync";
import { toContactStage } from "@/lib/crm/stage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Messenger settings | TravelSentro Admin",
};

/** The 15-minute check hasn't run for over an hour (or ever). */
function isStale(lastSyncedAt: string | null): boolean {
  return !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > 60 * 60 * 1000;
}

/**
 * How Messenger feeds the CRM (lib/meta-sync/poll.ts): when it last
 * checked, and the saved-reply rules that move leads forward.
 */
export default async function MessengerSettingsPage() {
  const profile = await requireModuleOrRedirect("leads");
  const canEdit = can(profile, "leads", "update");
  const supabase = await createClient();

  const [phrasesResult, stateResult] = await Promise.all([
    supabase
      .from("messenger_stage_phrases")
      .select("id, phrase, stage")
      .order("created_at", { ascending: true }),
    supabase.from("messenger_sync_state").select("last_synced_at, last_result").maybeSingle(),
  ]);
  if (phrasesResult.error) console.error("Failed to load stage phrases:", phrasesResult.error.message);

  const phrases: StagePhrase[] = (phrasesResult.data ?? []).map((p) => ({
    id: p.id,
    phrase: p.phrase,
    stage: toContactStage("b2c", p.stage),
  }));
  const lastSyncedAt = stateResult.data?.last_synced_at ?? null;
  const lastResult = (stateResult.data?.last_result ?? null) as {
    linked?: number;
    movedToInquiry?: number;
    movedBySavedReply?: number;
    quoteSuggestions?: number;
  } | null;
  const stale = isStale(lastSyncedAt);
  // Staging and local dev never read Messenger (production only).
  const syncRuns = isMetaLeadSyncEnabled();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messenger settings"
        description="How Facebook Messenger chats update lead stages in the CRM."
      >
        <Link href="/admin/crm" className="text-sm text-primary hover:underline">
          Back to Contacts
        </Link>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm">
          <p>
            Every 15 minutes the CRM reads new messages on the Facebook Page. You only step
            in at a few points.
          </p>

          <section className="flex flex-col gap-1.5">
            <h3 className="font-semibold">1. A new chat comes in</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                If the chat mentions an existing lead&apos;s email or phone (Facebook lead
                form messages do), it&apos;s linked to that lead by itself.
              </li>
              <li>
                Otherwise it shows on the Leads page under{" "}
                <strong>Messenger to-do → Chats not matched yet</strong>. Pick{" "}
                <strong>Match to a lead</strong>, <strong>Add as new lead</strong> (they
                start at Inquiry), or <strong>Not a lead</strong>.
              </li>
              <li>A lead at New who writes to you moves to Inquiry.</li>
              <li>An email or phone number they type in the chat is added to their lead.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="font-semibold">2. You send the quote</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Send a picture in the chat (like a package poster) and the lead asks{" "}
                <strong>&ldquo;Mark as Quotation?&rdquo;</strong>. Click{" "}
                <strong>Yes, Quotation</strong>.
              </li>
              <li>Creating a quote for the lead in the CRM moves them to Quotation too.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="font-semibold">3. Follow-ups start if they go quiet</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Lead has an email:</strong> follow-up emails go out by themselves at
                9 AM, 1, 3, 5 and 10 days apart (4 in total).
              </li>
              <li>
                <strong>No email:</strong> the lead shows under{" "}
                <strong>Messenger to-do → Follow up today</strong> on day 1 and day 4. Copy
                the message, open the chat, send it, then click <strong>Mark sent</strong>.
                Facebook only lets the Page reply within 7 days of their last message.
              </li>
              <li>
                Follow-ups stop when they reply, tap a chat button in an email, unsubscribe,
                or you move them to another stage.
              </li>
            </ul>
          </section>

          <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-4">
            <p className="font-semibold">Example</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Monday: Maria messages &ldquo;How much is Boracay for 2?&rdquo;. She appears
                under Chats not matched yet; you click <strong>Add as new lead</strong>.
              </li>
              <li>
                You reply with the price poster and click <strong>Yes, Quotation</strong> on
                her lead.
              </li>
              <li>She types &ldquo;maria@gmail.com&rdquo; — her lead now has an email.</li>
              <li>She goes quiet. On Tuesday she gets the first follow-up email.</li>
              <li>
                She taps <strong>Chat with us on Messenger</strong> in it. The follow-ups
                stop and you continue in the chat.
              </li>
            </ol>
          </div>

          <p
            className={
              stale && syncRuns ? "text-destructive" : "text-muted-foreground"
            }
          >
            {!syncRuns
              ? "This site doesn't read Messenger — only the live site does, so nothing here updates from chats."
              : `${
                  lastSyncedAt
                    ? `Last checked ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
                    : "Not checked yet"
                }${
                  lastResult
                    ? ` · ${lastResult.linked ?? 0} linked, ${lastResult.movedToInquiry ?? 0} moved to Inquiry, ${lastResult.quoteSuggestions ?? 0} quote checks, ${lastResult.movedBySavedReply ?? 0} moved by saved replies`
                    : ""
                }${stale ? " — the 15-minute check isn't running; check Vercel → Crons." : ""}`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved replies that move the stage (optional)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Save your usual replies in the Facebook inbox (Saved Replies), then paste a
            sentence from each one here. Capital letters and extra spaces don&apos;t matter.
            Leads only move forward, never back.
          </p>
          <MessengerPhrases phrases={phrases} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
