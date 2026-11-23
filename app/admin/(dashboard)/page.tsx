import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/dal";
import { firstReadableHref } from "@/lib/auth/permissions";

/**
 * Post-login landing: sends the account to the first admin page it may
 * view. A staff account with no permissions yet sees a short note instead
 * of a "Permission Denied" page.
 */
export default async function AdminHomePage() {
  const profile = await getProfile();
  const href = firstReadableHref(profile);

  if (href) {
    redirect(href);
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="font-heading text-xl font-semibold">No access yet</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account doesn&apos;t have access to any pages yet. Ask an Admin
        to turn on the permissions you need.
      </p>
    </div>
  );
}
