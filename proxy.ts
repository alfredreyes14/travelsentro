import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Global "coming soon" gate (COMING_SOON_MODE=true on Vercel). Admin and API
// routes stay reachable so staff can keep working and webhooks (e.g. the
// Messenger bot) keep responding while the public site is hidden.
const COMING_SOON_PATH = "/coming-soon";

export async function proxy(request: NextRequest) {
  if (process.env.COMING_SOON_MODE === "true") {
    const { pathname } = request.nextUrl;
    const isExempt =
      pathname === COMING_SOON_PATH ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api");

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
