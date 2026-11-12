import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "@/components/admin/events/event-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "New event | TravelSentro Admin",
};

export default async function NewEventPage() {
  await requirePermissionOrRedirect("can_manage_packages");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New event" description="Add an event TravelSentro sponsors, organizes or joins." />
      <EventForm />
      <Card className="gap-2 p-5 sm:p-8">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">Gallery</h2>
        <p className="text-sm text-muted-foreground">Save the event to add gallery photos.</p>
      </Card>
    </div>
  );
}
