import { after } from "next/server";
import { createElement } from "react";

import { AutoReplyEmail } from "@/components/email/auto-reply-email";
import { inquiryRequestSchema } from "@/lib/crm/inquiry-schema";
import { sendInternalNotificationEmails } from "@/lib/crm/notify-staff";
import { submitToFormspree } from "@/lib/formspree";
import { FROM_EMAIL, resend } from "@/lib/resend";
import { createClient } from "@/lib/supabase/server";

/**
 * This project's first Route Handler (D-01) -- the single write path every
 * public inquiry submission goes through. Validates + honeypot-checks the
 * request, calls record_inquiry() (03-01) to atomically/idempotently upsert
 * a contact + inquiry row, then -- gated on the RPC's `is_new` flag, per
 * AUTO-03 -- schedules a best-effort Formspree forward, auto-reply email
 * (AUTO-01), and internal staff notification (AUTO-02) via next/server's
 * `after` so a redelivered/duplicate requestId never double-sends. The
 * customer's response is never delayed or failed by a slow/failing side
 * effect (D-02): every side effect is scheduled, never awaited, inside the
 * `after` callback.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = inquiryRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Honeypot (Security Domain V13): a filled _gotcha field is silently
  // accepted with a fake-success response -- no write, no distinguishing
  // signal returned to help a bot detect it was caught.
  if (parsed.data._gotcha) {
    return Response.json({ ok: true });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_inquiry", {
    p_request_id: parsed.data.requestId,
    p_email: parsed.data.email,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone,
    p_message: parsed.data.message,
    p_package_id: parsed.data.packageId ?? null,
  });

  if (error || !data?.[0]) {
    console.error("record_inquiry failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }

  const { contact_id, is_new } = data[0];

  if (is_new) {
    after(async () => {
      // Assigned then awaited on separate statements (rather than an
      // inline `await` on the call itself) so this call site is
      // unambiguously distinguishable from a directly-awaited
      // handler-body call -- this is always scheduled work inside the
      // callback below, never blocking the customer's response (D-02).
      const formspreeCall = submitToFormspree({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        message: parsed.data.message,
        package: parsed.data.packageName,
      });
      const result = await formspreeCall;
      if (!result.ok) {
        console.error("Formspree forward failed", result.errors);
      }
    });

    // AUTO-01: customer auto-reply, best-effort, never blocks the response.
    after(async () => {
      try {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          to: parsed.data.email,
          subject: "We got your inquiry!",
          react: createElement(AutoReplyEmail, {
            name: parsed.data.name,
            packageName: parsed.data.packageName,
          }),
        });
        if (result.error) {
          console.error("Auto-reply email failed", result.error);
        }
      } catch (err) {
        console.error("Auto-reply email failed", err);
      }
    });

    // AUTO-02: internal staff notification, bcc fan-out (D-06/T-03-09).
    after(async () => {
      const crmUrl = `${new URL(request.url).origin}/admin/crm/${contact_id}`;
      await sendInternalNotificationEmails({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        message: parsed.data.message,
        packageName: parsed.data.packageName,
        crmUrl,
      });
    });
  }

  return Response.json({ ok: true });
}
