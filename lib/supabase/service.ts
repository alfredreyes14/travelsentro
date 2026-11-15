import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client: bypasses RLS. Only for server code that has
 * already checked its caller some other way:
 * - cron jobs and the Meta lead sync, after CRON_SECRET or requirePermission(),
 * - the public inquiry route, after Zod validation and the honeypot, and only
 *   to call record_inquiry() / get_notification_recipients(),
 * - the unsubscribe page, after the HMAC link check, and only to call
 *   set_contact_opted_out().
 * Never use it to read or write data on behalf of a staff member or visitor.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
