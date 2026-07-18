import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const UNGATED_ADMIN_PATHS = [
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
];

/**
 * Optimistic session refresh for proxy.ts (Next.js 16 — see node_modules/next/dist/docs
 * 01-app/03-api-reference/03-file-conventions/proxy.md). Refreshes the Supabase session
 * cookie on every request and redirects obviously-unauthenticated /admin/* visits.
 *
 * This is an OPTIMISTIC check only — never the sole authorization boundary. Real
 * enforcement happens in lib/auth/dal.ts (getProfile()/requirePermission()) and RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Must re-create response INSIDE this callback — building it before
          // setAll runs drops the refreshed session cookie (Pitfall 2).
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isUngatedAdminPath = UNGATED_ADMIN_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (
    !user &&
    request.nextUrl.pathname.startsWith("/admin") &&
    !isUngatedAdminPath
  ) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return response;
}
