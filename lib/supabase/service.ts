import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client: bypasses RLS. Only for server code that has
 * already authenticated its caller some other way -- today just the Meta
 * webhook, which verifies Meta's signature before writing a lead. Never use
 * it to serve a request on behalf of a staff member or visitor.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
