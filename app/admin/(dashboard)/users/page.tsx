import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { UsersTable } from "@/components/admin/users-table";

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
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[24px] leading-[1.2] font-semibold">
          Users
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage Admin and Staff accounts and their permissions.
        </p>
      </div>

      <UsersTable profiles={profiles ?? []} />
    </div>
  );
}
