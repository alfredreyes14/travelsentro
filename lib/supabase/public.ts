import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client (anon key) for public, RLS-open reads in
 * Server Components that should stay statically cacheable (ISR).
 *
 * lib/supabase/server.ts's createClient() calls next/headers' cookies(),
 * which forces the calling route into fully dynamic rendering on every
 * request -- fine for session-aware pages, but wasted work for pages like
 * the homepage where every visitor sees the same admin-managed content.
 * This client touches no request-scoped API, so a route that only uses it
 * (plus an explicit `export const revalidate`) can be served from cache.
 *
 * No <Database> generic, matching this project's existing untyped-client
 * convention (see app/(public)/page.tsx) -- joined/embedded selects are cast
 * onto the raw result by hand at the call site instead.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
