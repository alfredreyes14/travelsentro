"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { MailIcon, MessageSquareIcon, MousePointerClickIcon } from "lucide-react";

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
  INQUIRY_SOURCE_LABELS,
  type InquirySource,
  type MetaLeadSourceDetails,
} from "@/lib/crm/inquiry-source";
import { STAGE_CHIP_CLASSNAME } from "@/lib/crm/stage";
import { CHAT_TARGET_LABELS, type ChatTarget } from "@/lib/follow-ups/links";
import { FOLLOW_UP_STEP_COUNT } from "@/lib/follow-ups/templates";
import { cn } from "@/lib/utils";

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
  followUpStep: number | null;
  /** Tracked chat-button clicks, oldest first. */
  clicks: { target: ChatTarget; createdAt: string }[];
};

type ActivityItem =
  | ({ kind: "inquiry" } & CrmDetailInquiry)
  | ({ kind: "message" } & CrmDetailMessage)
  | { kind: "auto_lost"; id: string; created_at: string };

/** A contact's inquiries and sent messages, newest first. */
export function ContactActivity({
  inquiries,
  messages,
  autoLostAt,
}: {
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
  /** When the follow-up automation moved this contact to Lost, if it did. */
  autoLostAt?: string | null;
}) {
  const activity: ActivityItem[] = [
    ...inquiries.map((i) => ({ kind: "inquiry" as const, ...i })),
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
    ...(autoLostAt
      ? [{ kind: "auto_lost" as const, id: "auto-lost", created_at: autoLostAt }]
      : []),
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
                    {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                  </TooltipContent>
                </Tooltip>
                {item.kind === "auto_lost" ? (
                  <>
                    <Badge
                      variant="outline"
                      className={cn("w-fit", STAGE_CHIP_CLASSNAME.lost)}
                    >
                      Moved to Lost automatically
                    </Badge>
                    <p className="text-base leading-[1.5]">
                      No reply after {FOLLOW_UP_STEP_COUNT} follow-up emails.
                    </p>
                  </>
                ) : item.kind === "inquiry" ? (
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
                      {item.followUpStep !== null ? (
                        <Badge variant="outline">
                          {item.followUpStep <= FOLLOW_UP_STEP_COUNT
                            ? `Follow-up ${item.followUpStep} of ${FOLLOW_UP_STEP_COUNT}`
                            : `Follow-up #${item.followUpStep}`}
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
                    {item.followUpStep !== null && item.status === "sent" ? (
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
