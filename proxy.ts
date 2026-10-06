import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { createPublicClient } from "@/lib/supabase/public";
import { isBarePackageCode, packagePath } from "@/lib/packages/package-url";

// Global "coming soon" gate (COMING_SOON_MODE=true on Vercel). Admin and API
// routes stay reachable so staff can keep working and webhooks (e.g. the
// Messenger bot) keep responding while the public site is hidden. SEO file
// routes stay reachable too — app/robots.ts already returns a disallow-all
// ruleset while this flag is on, but only if the proxy doesn't rewrite the
// request to the coming-soon HTML page before it gets there (which would
// otherwise leave /robots.txt and /sitemap.xml serving unparseable HTML
// instead of an actual disallow rule). The generated OG/Twitter images are
// exempt for the same reason -- they have no file extension, so the matcher
// below doesn't skip them, and rewriting them leaves every link preview
// (Facebook, Messenger) with HTML where an image should be. /privacy-policy also stays reachable
// and crawlable — app/robots.ts explicitly allows it while this flag is on —
// since it needs to be live for Facebook app review regardless of launch
// status.
const COMING_SOON_PATH = "/coming-soon";
const SEO_FILE_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/twitter-image",
];
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

  const legacyPackageRedirect = await redirectBarePackageCode(request);
  if (legacyPackageRedirect) return legacyPackageRedirect;

  // updateSession() calls supabase.auth.getUser() -- a network round-trip
  // to Supabase's Auth servers. Only /admin/* needs the session-refresh +
  // unauthenticated-redirect behavior it provides, but the matcher below
  // also runs this proxy for every public page request. Skipping it there
  // saves a full auth round-trip for every anonymous visitor to the public
  // site.
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  return updateSession(request);
}

/**
 * 308s /packages/TSP-000032 (the pre-readable-URL format, still in links
 * shared on Facebook/Messenger) to /packages/<name>-tsp-000032. Done here
 * rather than in the page because the page renders under loading.tsx
 * Suspense boundaries: by the time it runs, a 200 has already been
 * streamed, so Next can only emit a client-side meta-refresh instead of a
 * real redirect status. The page still meta-refreshes for the rarer
 * outdated-name case (after a rename), which Google also treats as
 * permanent. Only bare-code URLs pay for the lookup -- current URLs pass
 * straight through. An unknown or unpublished code falls through to the
 * page's notFound().
 */
async function redirectBarePackageCode(
  request: NextRequest
): Promise<NextResponse | null> {
  const match = request.nextUrl.pathname.match(/^\/packages\/([^/]+)$/);
  if (!match || !isBarePackageCode(match[1])) return null;

  const { data: pkg } = await createPublicClient()
    .from("packages")
    .select("slug, name")
    .eq("slug", match[1].toUpperCase())
    .eq("is_published", true)
    .maybeSingle();
  if (!pkg) return null;

  const url = request.nextUrl.clone();
  url.pathname = packagePath(pkg);
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
