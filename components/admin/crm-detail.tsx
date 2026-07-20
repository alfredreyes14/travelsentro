"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { updateStatus } from "@/actions/crm";
import { ContactEditForm } from "./contact-edit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONTACT_STATUSES,
  STATUS_BADGE_CLASSNAME,
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
  type ContactStatus,
} from "@/lib/crm/status";

const STATUS_ERROR_MESSAGE =
  "Something went wrong updating the status. Please try again.";

export type CrmDetailContact = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: ContactStatus;
  tags: string[];
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
};

export type CrmDetailInquiry = {
  id: string;
  message: string;
  created_at: string;
  package_id: string | null;
  packages: { id: string; name: string; slug: string } | null;
};

export function CrmDetail({
  contact,
  inquiries,
  canEdit,
}: {
  contact: CrmDetailContact;
  inquiries: CrmDetailInquiry[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ContactStatus>(contact.status);
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);

  function handleStatusChange(newStatus: ContactStatus) {
    const previous = status;
    setStatus(newStatus);
    startTransition(async () => {
      try {
        const result = await updateStatus(contact.id, newStatus);
        if (!result.ok) {
          toast.error(result.error);
          setStatus(previous);
        }
      } catch {
        toast.error(STATUS_ERROR_MESSAGE);
        setStatus(previous);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[20px] leading-[1.2] font-semibold">
            {contact.name}
          </h1>
          {canEdit ? (
            <Select
              value={status}
              onValueChange={(value) =>
                handleStatusChange(value as ContactStatus)
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge
              variant={STATUS_BADGE_VARIANT[status]}
              className={STATUS_BADGE_CLASSNAME[status]}
            >
              {STATUS_LABELS[status]}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          {contact.created_by ? (
            <p>
              Added by {contact.created_by_name ?? "a staff member"} on{" "}
              {format(new Date(contact.created_at), "MMM d, yyyy")}
            </p>
          ) : (
            <p>
              Added {formatDistanceToNow(new Date(contact.created_at))} ago
            </p>
          )}
          {contact.updated_by ? (
            <p>
              Last updated by {contact.updated_by_name ?? "a staff member"}{" "}
              {formatDistanceToNow(new Date(contact.updated_at))} ago
            </p>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contact Info</CardTitle>
          {canEdit ? (
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger
                render={<Button variant="secondary" size="sm" />}
              >
                Edit Contact
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Contact</DialogTitle>
                </DialogHeader>
                <ContactEditForm
                  contact={contact}
                  onSuccess={() => {
                    setIsEditOpen(false);
                    router.refresh();
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {contact.email}
          </p>
          <p>
            <span className="text-muted-foreground">Phone: </span>
            {contact.phone ?? "—"}
          </p>
          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
          Inquiry History
        </h2>

        {inquiries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inquiries yet.</p>
        ) : (
          <ol className="flex flex-col gap-6">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className="border-l-2 border-border pl-4">
                <div className="flex flex-col gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="w-fit text-sm font-semibold text-muted-foreground" />
                      }
                    >
                      {formatDistanceToNow(new Date(inquiry.created_at), {
                        addSuffix: true,
                      })}
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(
                        new Date(inquiry.created_at),
                        "MMM d, yyyy h:mm a"
                      )}
                    </TooltipContent>
                  </Tooltip>
                  <p className="text-base leading-[1.5]">{inquiry.message}</p>
                  {inquiry.package_id && inquiry.packages ? (
                    <Link
                      href={`/admin/packages/${inquiry.packages.id}`}
                      className="w-fit"
                    >
                      <Badge variant="secondary">
                        {inquiry.packages.name}
                      </Badge>
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      General inquiry
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
