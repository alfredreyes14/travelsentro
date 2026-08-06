"use client";

import { useEffect } from "react";

/**
 * Route-segment error boundary for app/admin/(dashboard)/**. Every
 * render-time throw currently reachable under this segment (packages/page.tsx,
 * packages/new/page.tsx, packages/[id]/page.tsx, users/page.tsx, all via
 * lib/auth/dal.ts's requirePermission()/requireAdmin()) is exclusively a
 * permission-gate Forbidden throw, so this boundary renders the UI-SPEC's
 * fixed denial copy unconditionally rather than branching on error content.
 * This also ensures the denial never leaks *why* access was denied — the
 * underlying error details are never rendered to the user.
 */
export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Developer-debugging only — never surfaced to the user.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="font-heading text-xl font-semibold">
        Permission Denied
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        You don&apos;t have permission to do that. Contact an Admin if you
        think this is a mistake.
      </p>
    </div>
  );
}
