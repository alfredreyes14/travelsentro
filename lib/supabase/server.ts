import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server/RSC Supabase client factory (anon key, @supabase/ssr).
 *
 * proxy.ts (root) refreshes the session cookie on every /admin/* request via
 * lib/supabase/proxy.ts's updateSession(). Cookie writes from this factory
 * are still best-effort when called from a Server Component render (which
 * can't mutate cookies — the write is caught and ignored below); Server
 * Actions and Route Handlers can write cookies directly.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since Phase 1
            // has no middleware refreshing sessions yet.
          }
        },
      },
    }
  );
}
