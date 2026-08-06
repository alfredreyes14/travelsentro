import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Permission Denied | TravelSentro Admin",
};

/**
 * Redirect target for requirePermissionOrRedirect()/requireAdminOrRedirect()
 * (lib/auth/dal.ts). Renders inside the dashboard shell (sidebar/logout
 * chrome from app/admin/(dashboard)/layout.tsx stays intact) so a
 * zero-permission Staff session that direct-navigates to a gated page gets
 * a graceful denial instead of Next's raw framework crash page (AUTH-05).
 *
 * This page performs no permission check of its own -- it is the denial
 * destination, not another gated page. Reuses the exact copy/structure of
 * app/admin/(dashboard)/error.tsx, which remains valid defense-in-depth for
 * any genuinely unexpected render-time exception under this segment but is
 * no longer the mechanism responsible for the permission-denied case.
 */
export default function ForbiddenPage() {
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
