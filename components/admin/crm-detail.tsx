"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { MailIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { updateStatus } from "@/actions/crm";
import { updateOptOut } from "@/actions/messages";
import { ContactEditForm } from "./contact-edit-form";
import { MessageComposeDialog } from "./message-compose-dialog";
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
import { Switch } from "@/components/ui/switch";
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
import {
  CHANNEL_LABELS,
  type MessageChannel,
  type MessageStatus,
} from "@/lib/crm/messages";

const STATUS_ERROR_MESSAGE =
  "Something went wrong updating the status. Please try again.";
const OPT_OUT_ERROR_MESSAGE =
  "Something went wrong updating this contact's opt-out status. Please try again.";

export type CrmDetailContact = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: ContactStatus;
  tags: string[];
  opted_out: boolean;
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

export type CrmDetailMessage = {
  id: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  status: MessageStatus;
  created_at: string;
  sent_by_name: string | null;
};

type ActivityItem =
  | ({ kind: "inquiry" } & CrmDetailInquiry)
  | ({ kind: "message" } & CrmDetailMessage);

export function CrmDetail({
  contact,
  inquiries,
  messages,
  canEdit,
}: {
  contact: CrmDetailContact;
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ContactStatus>(contact.status);
  const [optedOut, setOptedOut] = useState(contact.opted_out);
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);

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

  function handleOptOutChange(checked: boolean) {
    const previous = optedOut;
    setOptedOut(checked);
    startTransition(async () => {
      try {
        const result = await updateOptOut(contact.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setOptedOut(previous);
        }
      } catch {
        toast.error(OPT_OUT_ERROR_MESSAGE);
        setOptedOut(previous);
      }
    });
  }

  const activity: ActivityItem[] = [
    ...inquiries.map((i) => ({ kind: "inquiry" as const, ...i })),
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

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
          <Button onClick={() => setIsMessageOpen(true)}>
            <SendIcon className="size-4" />
            Message
          </Button>
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
          {canEdit ? (
            <div className="flex items-center gap-2 pt-2">
              <Switch
                checked={optedOut}
                onCheckedChange={handleOptOutChange}
                disabled={isPending}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  Opted out of bulk messages
                </span>
                <span className="text-sm text-muted-foreground">
                  This contact won&apos;t receive bulk email or SMS sends.
                  Individual messages are still allowed.
                </span>
              </div>
            </div>
          ) : optedOut ? (
            <Badge variant="outline" className="w-fit">
              Opted out
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
          Activity
        </h2>

        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No inquiries or messages yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-6">
            {activity.map((item) => (
              <li key={item.id} className="border-l-2 border-border pl-4">
                <div className="flex flex-col gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="w-fit text-sm font-semibold text-muted-foreground" />
                      }
                    >
                      {formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                      })}
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(
                        new Date(item.created_at),
                        "MMM d, yyyy h:mm a"
                      )}
                    </TooltipContent>
                  </Tooltip>
                  {item.kind === "inquiry" ? (
                    <>
                      <p className="text-base leading-[1.5]">
                        {item.message}
                      </p>
                      {item.package_id && item.packages ? (
                        <Link
                          href={`/admin/packages/${item.packages.id}`}
                          className="w-fit"
                        >
                          <Badge variant="secondary">
                            {item.packages.name}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          General inquiry
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {item.channel === "email" ? (
                          <MailIcon className="size-4 text-muted-foreground" />
                        ) : (
                          <MessageSquareIcon className="size-4 text-muted-foreground" />
                        )}
                        <span className="text-sm text-muted-foreground">
                          {CHANNEL_LABELS[item.channel]}
                        </span>
                      </div>
                      {item.channel === "email" && item.subject ? (
                        <p className="text-base leading-[1.5] font-semibold">
                          {item.subject}
                        </p>
                      ) : null}
                      <p className="text-base leading-[1.5]">{item.body}</p>
                      {item.status === "failed" ? (
                        <Badge variant="destructive" className="w-fit">
                          Failed to send
                        </Badge>
                      ) : null}
                      <p className="text-sm text-muted-foreground">
                        Sent by {item.sent_by_name ?? "a staff member"}
                      </p>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <MessageComposeDialog
        contacts={[
          {
            id: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            opted_out: optedOut,
          },
        ]}
        mode="individual"
        open={isMessageOpen}
        onOpenChange={setIsMessageOpen}
        onSuccess={() => {
          setIsMessageOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
