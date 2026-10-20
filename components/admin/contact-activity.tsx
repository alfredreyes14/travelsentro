"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { MailIcon, MessageSquareIcon } from "lucide-react";

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

type ActivityItem =
  | ({ kind: "inquiry" } & CrmDetailInquiry)
  | ({ kind: "message" } & CrmDetailMessage);

/** A contact's inquiries and sent messages, newest first. */
export function ContactActivity({
  inquiries,
  messages,
}: {
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
}) {
  const activity: ActivityItem[] = [
    ...inquiries.map((i) => ({ kind: "inquiry" as const, ...i })),
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
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
                    (item.sourceDetails.campaignName || item.sourceDetails.adName) ? (
                      <p className="text-sm text-muted-foreground">
                        {[
                          item.sourceDetails.campaignName &&
                            `Campaign: ${item.sourceDetails.campaignName}`,
                          item.sourceDetails.adName &&
                            `Ad: ${item.sourceDetails.adName}`,
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
