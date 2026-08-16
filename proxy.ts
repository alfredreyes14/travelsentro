import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Global "coming soon" gate (COMING_SOON_MODE=true on Vercel). Admin and API
// routes stay reachable so staff can keep working and webhooks (e.g. the
// Messenger bot) keep responding while the public site is hidden. SEO file
// routes stay reachable too — app/robots.ts already returns a disallow-all
// ruleset while this flag is on, but only if the proxy doesn't rewrite the
// request to the coming-soon HTML page before it gets there (which would
// otherwise leave /robots.txt and /sitemap.xml serving unparseable HTML
// instead of an actual disallow rule). /privacy-policy also stays reachable
// and crawlable — app/robots.ts explicitly allows it while this flag is on —
// since it needs to be live for Facebook app review regardless of launch
// status.
const COMING_SOON_PATH = "/coming-soon";
const SEO_FILE_PATHS = ["/robots.txt", "/sitemap.xml"];
const ALWAYS_REACHABLE_PATHS = ["/privacy-policy"];

export async function proxy(request: NextRequest) {
  if (process.env.COMING_SOON_MODE === "true") {
    const { pathname } = request.nextUrl;
    const isExempt =
      pathname === COMING_SOON_PATH ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api") ||
      SEO_FILE_PATHS.includes(pathname) ||
      ALWAYS_REACHABLE_PATHS.includes(pathname);

    if (!isExempt) {
      return NextResponse.rewrite(new URL(COMING_SOON_PATH, request.url));
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
