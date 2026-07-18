import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server/RSC Supabase client factory (anon key, @supabase/ssr).
 *
 * Phase 1 has no auth, so cookie writes are best-effort only (a Server
 * Component render can't mutate cookies — the write is caught and ignored).
 * The shape matches the official createServerClient pattern so Phase 2 can
 * extend this with real session refresh via middleware without reshaping
 * the client.
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
