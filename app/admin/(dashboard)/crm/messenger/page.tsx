import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { MessengerPhrases, type StagePhrase } from "@/components/admin/messenger-phrases";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/auth/dal";
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
  const profile = await getProfile();
  const canEdit = profile.role === "admin" || profile.can_edit_crm;
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
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>Every 15 minutes the CRM reads new Messenger messages:</p>
          <ul className="list-disc pl-5">
            <li>
              A chat is linked to its contact automatically when the lead&apos;s email or
              phone appears in it (the Facebook lead form message has both). Others can be
              linked by hand on the contact page.
            </li>
            <li>When a linked lead writes to you, they move from New to Inquiry.</li>
            <li>
              When staff send a picture in the chat (like a package poster), the Leads page
              asks &ldquo;Mark as Quotation?&rdquo;. Creating a quote for the lead in the CRM
              moves them to Quotation right away.
            </li>
            <li>
              Chats that aren&apos;t matched to a lead, and Messenger follow-ups for leads
              without an email, are listed in the Leads page&apos;s Messenger to-do. When a
              lead types their email or phone in the chat, it&apos;s added to their lead.
            </li>
            <li>Optional: staff saved replies listed below move the lead to their stage.</li>
          </ul>
          <p className={stale ? "text-destructive" : "text-muted-foreground"}>
            {lastSyncedAt
              ? `Last checked ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
              : "Not checked yet"}
            {lastResult
              ? ` · ${lastResult.linked ?? 0} linked, ${lastResult.movedToInquiry ?? 0} moved to Inquiry, ${lastResult.quoteSuggestions ?? 0} quote checks, ${lastResult.movedBySavedReply ?? 0} moved by saved replies`
              : ""}
            {stale
              ? " — the 15-minute check isn't running. It runs on the live site only; check Vercel → Crons."
              : ""}
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
