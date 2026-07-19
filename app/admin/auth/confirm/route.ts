import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * PKCE code-exchange Route Handler (02-REVIEW.md CR-01, D-06). The emailed
 * password-reset link's `code` query param lands here first — Route
 * Handlers (unlike Server Components) can write cookies directly, so this
 * is the only safe place to exchange it for a session before the user
 * reaches /admin/reset-password's updatePassword() call.
 *
 * Both redirect targets below are hardcoded internal paths built from
 * request.url — never from a query-supplied value — so there is no
 * open-redirect surface (T-02-09).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    // 02-15 (AUTH-01/D-06 gap closure): distinguishable diagnostic for the
    // missing-code failure path — never logs a query-supplied value, only a
    // fixed literal and the request path.
    console.error("[admin-auth-confirm] missing code param", {
      path: request.nextUrl.pathname,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    // 02-18 (AUTH-01/D-06 gap closure, hypothesis-testing diagnostic only):
    // logs the User-Agent of a SUCCESSFUL exchange so a future live retest
    // can compare it against a later failed exchange's User-Agent, to test
    // whether a non-human client (e.g. an email link-scanner/prefetcher)
    // consumed the single-use code before a human's click failed on it.
    console.log("[admin-auth-confirm] exchangeCodeForSession succeeded", {
      userAgent: request.headers.get("user-agent"),
      timestamp: new Date().toISOString(),
    });
    return NextResponse.redirect(
      new URL("/admin/reset-password", request.url)
    );
  }

  // 02-15 (AUTH-01/D-06 gap closure): distinguishable diagnostic for the
  // exchange-failure path — only the SDK's own AuthError fields are logged,
  // never the raw single-use PKCE code or any cookie/session content.
  console.error("[admin-auth-confirm] exchangeCodeForSession failed", {
    message: error.message,
    status: error.status,
    code: error.code,
    userAgent: request.headers.get("user-agent"),
  });

  // Missing or invalid code — never fall through to establishing a session.
  return NextResponse.redirect(new URL("/admin/login", request.url));
}
