"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  MailIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PhoneIcon,
  Trash2Icon,
} from "lucide-react";
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
import { CHAT_TARGET_LABELS, type ChatTarget } from "@/lib/follow-ups/links";
import {
  FOLLOW_UP_SEQUENCE_LABELS,
  FOLLOW_UP_STEP_COUNT,
  type FollowUpSequence,
} from "@/lib/follow-ups/templates";
import { useCan } from "@/components/admin/permissions-provider";

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
  /** Set for follow-ups: which follow-up this was (1, 2, ...). */
  followUp: { sequence: FollowUpSequence; step: number } | null;
  /** Tracked chat-button clicks, oldest first. */
  clicks: { target: ChatTarget; createdAt: string }[];
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
}: {
  contactId: string;
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
  contactLogs: CrmDetailContactLog[];
}) {
  const canDelete = useCan("leads", "delete");
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
                      {canDelete ? (
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
                      {item.followUp !== null ? (
                        <Badge variant="outline">
                          {FOLLOW_UP_SEQUENCE_LABELS[item.followUp.sequence]} ·{" "}
                          {item.followUp.step <= FOLLOW_UP_STEP_COUNT
                            ? `${item.followUp.step} of ${FOLLOW_UP_STEP_COUNT}`
                            : `#${item.followUp.step}`}
                        </Badge>
                      ) : null}
                    </div>
                    {item.channel === "email" && item.subject ? (
                      <p className="text-base leading-[1.5] font-semibold">
                        {item.subject}
                      </p>
                    ) : null}
                    <p className="text-base leading-[1.5] whitespace-pre-line">
                      {item.body}
                    </p>
                    {item.followUp !== null && item.status === "sent" && item.channel !== "messenger" ? (
                      <FollowUpClicks clicks={item.clicks} />
                    ) : null}
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

/** "Clicked Messenger 2 hours ago · 3 clicks", or "Not clicked yet". */
function FollowUpClicks({
  clicks,
}: {
  clicks: { target: ChatTarget; createdAt: string }[];
}) {
  if (clicks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Chat link not clicked yet</p>
    );
  }

  const first = clicks[0];
  const targets = [...new Set(clicks.map((c) => CHAT_TARGET_LABELS[c.target]))];

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <MousePointerClickIcon className="size-4 text-green-700" />
      <span className="font-semibold text-green-700">
        Clicked to chat on {targets.join(" and ")}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={<span className="text-muted-foreground" />}
        >
          {formatDistanceToNow(new Date(first.createdAt), { addSuffix: true })}
        </TooltipTrigger>
        <TooltipContent>
          First click {format(new Date(first.createdAt), "MMM d, yyyy h:mm a")}
        </TooltipContent>
      </Tooltip>
      {clicks.length > 1 ? (
        <span className="text-muted-foreground">· {clicks.length} clicks</span>
      ) : null}
    </div>
  );
}
