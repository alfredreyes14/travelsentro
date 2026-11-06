import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { loadSoaFormOptions } from "@/lib/soa/soa-options";
import {
  previousSoaRowToFormValues,
  soaRowToFormValues,
  toSoaKind,
} from "@/lib/soa/soa-row";
import { PageHeader } from "@/components/admin/page-header";
import { PreviousSoaForm } from "@/components/admin/soa/previous-soa-form";
import { SoaForm } from "@/components/admin/soa/soa-form";
import type { SoaEmailDefaults } from "@/components/admin/soa/soa-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Edit SOA | TravelSentro Admin",
};

export default async function EditSoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const [soaResult, options, emailsResult] = await Promise.all([
    supabase.from("statements").select("*").eq("id", id).maybeSingle(),
    loadSoaFormOptions(supabase),
    supabase
      .from("statement_emails")
      .select("id, sent_to, status, sent_by_name, created_at")
      .eq("statement_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (soaResult.error) console.error("Failed to load statement:", soaResult.error.message);
  if (!soaResult.data) notFound();
  if (emailsResult.error) console.error("Failed to load SOA emails:", emailsResult.error.message);

  const soa = soaResult.data;
  const kind = toSoaKind(soa.kind);
  const canCreateContact = profile.role === "admin" || profile.can_edit_crm;
  const linkedContact = options.contacts.find((c) => c.id === soa.contact_id) ?? null;

  const emailDefaults: SoaEmailDefaults = {
    soaNo: soa.soa_no,
    originalNo: soa.original_no,
    billToName: soa.bill_to_name,
    contactEmail: linkedContact?.email ?? null,
  };
  const emails = emailsResult.data ?? [];

  const shared = {
    soaId: soa.id,
    contacts: options.contacts,
    existingTags: options.existingTags,
    canCreateContact,
    emailDefaults,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`SOA ${soa.soa_no}`}
        description={
          kind === "previous"
            ? `Previous SOA${soa.original_no ? ` ${soa.original_no}` : ""} · ${soa.bill_to_name}`
            : soa.bill_to_name
        }
      >
        {linkedContact ? (
          <Link
            href={`/admin/crm/${linkedContact.id}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Open contact: {linkedContact.name}
          </Link>
        ) : null}
      </PageHeader>

      {/* Throws on malformed stored jsonb -> the admin error boundary, never a half-filled form. */}
      {kind === "previous" ? (
        <PreviousSoaForm
          {...shared}
          defaultValues={previousSoaRowToFormValues(soa)}
          savedFile={
            soa.file_name && soa.file_size_bytes
              ? { name: soa.file_name, sizeBytes: soa.file_size_bytes }
              : null
          }
        />
      ) : (
        <SoaForm
          {...shared}
          vouchers={options.vouchers}
          defaultValues={soaRowToFormValues(soa)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Email history</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {emails.length === 0 ? (
            <p className="text-muted-foreground">Not emailed yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {emails.map((email) => (
                <li key={email.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Badge variant={email.status === "sent" ? "secondary" : "destructive"}>
                    {email.status === "sent" ? "Sent" : "Failed"}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{email.sent_to}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(email.created_at), "MMM d, yyyy h:mm a")}
                    {email.sent_by_name ? ` · ${email.sent_by_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
