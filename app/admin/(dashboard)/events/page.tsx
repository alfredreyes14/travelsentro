import type { Metadata } from "next";
import Link from "next/link";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/events/event-dates";
import { PageHeader } from "@/components/admin/page-header";
import { EventsTable } from "@/components/admin/events/events-table";
import { toEventRecord } from "@/components/admin/events/event-record";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Events | TravelSentro Admin",
};

export default async function AdminEventsPage() {
  // AUTH-05 -- gate independent of nav hiding; RLS is the second layer.
  // Reuses can_manage_packages like Partners and Content.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("events")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Failed to load events:", error.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Events"
        description="Sponsorships, exhibits and booths shown on the Events page. Switch on Homepage to also feature one on the homepage."
      >
        <Button size="lg" nativeButton={false} render={<Link href="/admin/events/new" />}>
          New event
        </Button>
      </PageHeader>

      <EventsTable initialItems={(rows ?? []).map(toEventRecord)} today={manilaToday()} />
    </div>
  );
}
