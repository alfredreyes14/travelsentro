import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { UsersTable } from "@/components/admin/users-table";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = {
  title: "Users | TravelSentro Admin",
};

export default async function UsersPage() {
  // AUTH-05 — a Staff member navigating here directly (bypassing D-13's
  // hidden nav link) is rejected here, independent of the nav hiding.
  await requireAdminOrRedirect();

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    // Surfaced server-side only — the page still renders (empty list)
    // rather than crashing the whole route on a transient DB error.
    console.error("Failed to load accounts:", error.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Manage Admin and Staff accounts and their permissions."
      />

      <UsersTable profiles={profiles ?? []} />
    </div>
  );
}
