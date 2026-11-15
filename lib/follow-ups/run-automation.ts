import "server-only";

import { SITE_URL } from "@/lib/constants";
import { remainingEmailQuota } from "@/lib/crm/email-quota";
import { createServiceClient } from "@/lib/supabase/service";

import { sendFollowUpEmails, type FollowUpEmailItem } from "./send";
import {
  FOLLOW_UP_GAP_DAYS,
  followUpEmailTemplate,
  toFollowUpSequence,
} from "./templates";

/**
 * The daily lead follow-up run (app/api/cron/follow-ups): emails every B2C
 * contact at New or Quotation whose next step is due (list_due_follow_ups()),
 * within what's left of the shared Resend quota. The stage picks the
 * sequence: New -> no_reply, Quotation -> quote (lib/follow-ups/templates.ts).
 * Leads are never moved to Lost automatically; staff do that by hand.
 *
 * On by default; FOLLOW_UPS_ENABLED=false switches it off. Vercel only runs
 * crons on production, so staging never emails leads on its own.
 */

export const AUTOMATED_SENDER_NAME = "Automated follow-up";

const DEFAULT_DAILY_LIMIT = 30;
const DEFAULT_MAX_LEAD_AGE_DAYS = 60;
// First run only: leads already waiting when follow-ups went live are
// emailed only if they came in during the last 3 weeks.
const DEFAULT_BACKLOG_DAYS = 21;
// Left free for website auto-replies, staff alerts and staff's own sends.
const QUOTA_RESERVE = 30;

export type FollowUpRunResult = {
  due: number;
  sent: number;
  failed: number;
  limit: number;
  skippedReason?: "disabled" | "quota";
};

export function isFollowUpAutomationEnabled(): boolean {
  return process.env.FOLLOW_UPS_ENABLED !== "false";
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
}

export async function runFollowUpAutomation(): Promise<FollowUpRunResult> {
  if (!isFollowUpAutomationEnabled()) {
    return { due: 0, sent: 0, failed: 0, limit: 0, skippedReason: "disabled" };
  }

  const supabase = createServiceClient();

  const quotaLeft = (await remainingEmailQuota(supabase)) - QUOTA_RESERVE;
  const limit = Math.min(envNumber("FOLLOW_UP_DAILY_LIMIT", DEFAULT_DAILY_LIMIT), quotaLeft);
  if (limit <= 0) {
    const result = { due: 0, sent: 0, failed: 0, limit: 0, skippedReason: "quota" as const };
    console.log("Follow-up automation:", result);
    return result;
  }

  const { data: due, error } = await supabase.rpc("list_due_follow_ups", {
    p_gap_days: FOLLOW_UP_GAP_DAYS,
    p_max_lead_age_days: envNumber("FOLLOW_UP_MAX_LEAD_AGE_DAYS", DEFAULT_MAX_LEAD_AGE_DAYS),
    p_limit: limit,
    p_backlog_days: envNumber("FOLLOW_UP_BACKLOG_DAYS", DEFAULT_BACKLOG_DAYS),
  });
  if (error) throw new Error(`list_due_follow_ups failed: ${error.message}`);

  const items: FollowUpEmailItem[] = (due ?? []).map(
    (row: {
      contact_id: string;
      name: string;
      email: string;
      sequence: string;
      next_step: number;
      package_name: string | null;
    }) => {
      const sequence = toFollowUpSequence(row.sequence);
      return {
        contactId: row.contact_id,
        name: row.name,
        email: row.email,
        sequence,
        step: row.next_step,
        ...followUpEmailTemplate(sequence, row.next_step, row.package_name),
      };
    }
  );

  const summary = await sendFollowUpEmails({
    supabase,
    items,
    sender: { id: null, name: AUTOMATED_SENDER_NAME },
    origin: siteOrigin(),
  });

  const result = {
    due: items.length,
    sent: summary.sent,
    failed: summary.failed,
    limit,
  };
  console.log("Follow-up automation:", result);
  return result;
}
