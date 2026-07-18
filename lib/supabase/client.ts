import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client factory (anon key, @supabase/ssr).
 *
 * Not required by Phase 1's server-rendered public pages (all catalog data
 * fetching happens in Server Components via lib/supabase/server.ts), but
 * scaffolded now per RESEARCH.md's project structure for Phase 2 client-side
 * usage consistency.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
