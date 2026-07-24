import type { Metadata } from "next";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmTable, type AdminContactListItem } from "@/components/admin/crm-table";
import type { ContactStatus } from "@/lib/crm/status";

export const metadata: Metadata = {
  title: "Contacts | TravelSentro Admin",
};

export default async function AdminCrmPage() {
  // CRM-03: read access is universal for every authenticated Staff/Admin,
  // regardless of can_edit_crm -- session validation only, no permission
  // gate (unlike requirePermissionOrRedirect on Packages/Users).
  await getProfile();

  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, name, email, phone, status, tags, opted_out, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load contacts:", error.message);
  }

  const items: AdminContactListItem[] = (contacts ?? []).map((contact) => ({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    status: contact.status as ContactStatus,
    tags: contact.tags,
    opted_out: contact.opted_out,
    createdAt: contact.created_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Contacts
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No contacts yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Contacts appear here automatically as soon as someone submits an
            inquiry on the public site.
          </p>
        </div>
      ) : (
        <CrmTable contacts={items} />
      )}
    </div>
  );
}
