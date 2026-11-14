"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { MailIcon, MessageSquareIcon, PhoneIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteContactLog } from "@/actions/contact-logs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CHANNEL_LABELS,
  type MessageChannel,
  type MessageStatus,
} from "@/lib/crm/messages";
import {
  CONTACT_LOG_CHANNEL_LABELS,
  type ContactLogChannel,
} from "@/lib/crm/contact-logs";
import {
  INQUIRY_SOURCE_LABELS,
  type InquirySource,
  type MetaLeadSourceDetails,
} from "@/lib/crm/inquiry-source";

export type CrmDetailInquiry = {
  id: string;
  message: string;
  created_at: string;
  package_id: string | null;
  packages: { id: string; name: string; slug: string } | null;
  source: InquirySource;
  sourceDetails: MetaLeadSourceDetails;
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

/** A contact made outside the panel, logged by staff (contact_logs). */
export type CrmDetailContactLog = {
  id: string;
  channel: ContactLogChannel;
  note: string | null;
  /** When the contact happened; named like the others so the timeline sorts on it. */
  created_at: string;
  logged_by_name: string | null;
};

type ActivityItem =
  | ({ kind: "inquiry" } & CrmDetailInquiry)
  | ({ kind: "message" } & CrmDetailMessage)
  | ({ kind: "log" } & CrmDetailContactLog);

function DeleteLogButton({ contactId, logId }: { contactId: string; logId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      disabled={isPending}
      aria-label="Remove this contact log"
      title="Remove this contact log"
      onClick={() => {
        if (!window.confirm("Remove this contact log?")) return;
        startTransition(async () => {
          try {
            const result = await deleteContactLog(contactId, logId);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Contact log removed.");
            router.refresh();
          } catch {
            toast.error("Something went wrong removing this entry. Please try again.");
          }
        });
      }}
    >
      <Trash2Icon />
    </Button>
  );
}

/** A contact's inquiries, sent messages and logged contacts, newest first. */
export function ContactActivity({
  contactId,
  inquiries,
  messages,
  contactLogs,
  canEdit,
}: {
  contactId: string;
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
  contactLogs: CrmDetailContactLog[];
  canEdit: boolean;
}) {
  const activity: ActivityItem[] = [
    ...inquiries.map((i) => ({ kind: "inquiry" as const, ...i })),
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
    ...contactLogs.map((l) => ({ kind: "log" as const, ...l })),
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
        Activity
      </h2>

      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No inquiries, messages or logged contacts yet.
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
                    {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                  </TooltipContent>
                </Tooltip>
                {item.kind === "inquiry" ? (
                  <>
                    {item.source === "meta_lead_ad" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {INQUIRY_SOURCE_LABELS.meta_lead_ad}
                        </Badge>
                        {item.sourceDetails.formName ? (
                          <span className="text-sm text-muted-foreground">
                            {item.sourceDetails.formName}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="text-base leading-[1.5] whitespace-pre-line">
                      {item.message}
                    </p>
                    {item.source === "meta_lead_ad" &&
                    (item.sourceDetails.campaignName ||
                      item.sourceDetails.adName ||
                      item.sourceDetails.adId) ? (
                      <p className="text-sm text-muted-foreground">
                        {[
                          item.sourceDetails.campaignName &&
                            `Campaign: ${item.sourceDetails.campaignName}`,
                          item.sourceDetails.adName &&
                            `Ad: ${item.sourceDetails.adName}`,
                          item.sourceDetails.adId &&
                            `Ad ID: ${item.sourceDetails.adId}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {item.package_id && item.packages ? (
                      <Link
                        href={`/admin/packages/${item.packages.id}`}
                        className="w-fit"
                      >
                        <Badge variant="secondary">{item.packages.name}</Badge>
                      </Link>
                    ) : item.source === "website" ? (
                      <span className="text-sm text-muted-foreground">
                        General inquiry
                      </span>
                    ) : null}
                  </>
                ) : item.kind === "log" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <PhoneIcon className="size-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Contacted via {CONTACT_LOG_CHANNEL_LABELS[item.channel]}
                      </span>
                      {canEdit ? (
                        <DeleteLogButton contactId={contactId} logId={item.id} />
                      ) : null}
                    </div>
                    {item.note ? (
                      <p className="text-base leading-[1.5] whitespace-pre-line">
                        {item.note}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Logged by {item.logged_by_name ?? "a staff member"}
                    </p>
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
  );
}
