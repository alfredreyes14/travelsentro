import { after } from "next/server";

import { inquiryRequestSchema } from "@/lib/crm/inquiry-schema";
import { submitToFormspree } from "@/lib/formspree";
import { createClient } from "@/lib/supabase/server";

/**
 * This project's first Route Handler (D-01) -- the single write path every
 * public inquiry submission goes through. Validates + honeypot-checks the
 * request, calls record_inquiry() (03-01) to atomically/idempotently upsert
 * a contact + inquiry row, then -- gated on the RPC's `is_new` flag, per
 * AUTO-03 -- schedules a best-effort Formspree forward via after() so a
 * redelivered/duplicate requestId never double-forwards. The customer's
 * response is never delayed or failed by a slow/failing Formspree call
 * (D-02): the forward is scheduled, never awaited, inside after().
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

  const { is_new } = data[0];

  if (is_new) {
    after(async () => {
      // Assigned then awaited on separate statements (rather than an
      // inline `await` on the call itself) so this call site is
      // unambiguously distinguishable from a directly-awaited
      // handler-body call -- this is always scheduled work inside
      // after(), never blocking the customer's response (D-02).
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
  }

  return Response.json({ ok: true });
}
