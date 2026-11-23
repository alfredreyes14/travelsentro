import { createElement } from "react";

import { InternalNotificationEmail } from "@/components/email/internal-notification-email";
import { FROM_EMAIL, resend } from "@/lib/resend";
import { createClient } from "@/lib/supabase/server";

type NotifyStaffParams = {
  name: string;
  email: string;
  phone: string;
  message: string;
  packageName?: string;
  crmUrl: string;
};

/**
 * AUTO-02/D-06 fan-out: bcc's the internal notification email to every
 * active profile with role='admin' or can_message_customers=true, via
 * get_notification_recipients() (03-01's least-privilege, email-only
 * SECURITY DEFINER RPC) -- avoids needing a service-role client here
 * (03-RESEARCH.md Pitfall 5).
 *
 * Best-effort only: called from a Route Handler's after() callback, so
 * every failure path logs and returns rather than throwing.
 */
export async function sendInternalNotificationEmails(
  params: NotifyStaffParams
): Promise<void> {
  const supabase = await createClient();
  const { data: recipients, error } = await supabase.rpc("get_notification_recipients");

  if (error || !recipients?.length) {
    console.error("get_notification_recipients failed", error);
    return;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      // Required-but-inert placeholder recipient -- Resend requires a `to`
      // field. The real audience is entirely in `bcc` below so no staff
      // member's address is visible to any other recipient (T-03-09).
      to: FROM_EMAIL,
      bcc: recipients.map((r: { email: string }) => r.email),
      subject: `New inquiry from ${params.name}`,
      react: createElement(InternalNotificationEmail, params),
    });

    if (result.error) {
      console.error("Internal notification email failed", result.error);
    }
  } catch (err) {
    console.error("Internal notification email failed", err);
  }
}

/**
 * Same alert as sendInternalNotificationEmails(), for several inquiries at
 * once: one recipient lookup and one Resend Batch API call per 100 alerts,
 * instead of two round trips per alert. Used by the Meta lead sync, which
 * can add many leads in one run.
 *
 * Best-effort like the single version: logs and returns on failure.
 */
export async function sendInternalNotificationEmailsBatch(
  list: NotifyStaffParams[]
): Promise<void> {
  if (list.length === 0) return;

  const supabase = await createClient();
  const { data: recipients, error } = await supabase.rpc("get_notification_recipients");

  if (error || !recipients?.length) {
    console.error("get_notification_recipients failed", error);
    return;
  }
  const bcc = recipients.map((r: { email: string }) => r.email);

  for (let i = 0; i < list.length; i += 100) {
    try {
      const result = await resend.batch.send(
        list.slice(i, i + 100).map((params) => ({
          from: FROM_EMAIL,
          // See sendInternalNotificationEmails: the audience is in bcc.
          to: FROM_EMAIL,
          bcc,
          subject: `New inquiry from ${params.name}`,
          react: createElement(InternalNotificationEmail, params),
        }))
      );
      if (result.error) {
        console.error("Internal notification emails failed", result.error);
      }
    } catch (err) {
      console.error("Internal notification emails failed", err);
    }
  }
}
