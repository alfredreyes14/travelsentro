"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  addLeadFromChat,
  confirmQuoteSuggestion,
  dismissQuoteSuggestion,
  markChatNotALead,
  markMessengerFollowUpSent,
  matchChatToLead,
  type MessengerFollowUpItem,
} from "@/actions/messenger-todo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FOLLOW_UP_SEQUENCE_LABELS,
  MESSENGER_FOLLOW_UP_GAP_DAYS,
} from "@/lib/follow-ups/templates";
import { useCan } from "@/components/admin/permissions-provider";

export type QuoteSuggestionItem = { contactId: string; name: string; at: string };
export type UnmatchedChatItem = {
  psid: string;
  name: string | null;
  snippet: string | null;
  lastInboundAt: string | null;
  chatUrl: string | null;
};
export type LeadOption = { id: string; name: string; detail: string | null };

type ActionResult = { ok: boolean; error?: string };

function ago(iso: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "";
}

/**
 * The Leads page's Messenger to-do: what the Messenger check found that
 * needs a person (actions/messenger-todo.ts).
 */
export function MessengerTodo({
  suggestions,
  chats,
  followUps,
  leads,
  canEdit,
  canMessage,
}: {
  suggestions: QuoteSuggestionItem[];
  chats: UnmatchedChatItem[];
  followUps: MessengerFollowUpItem[];
  leads: LeadOption[];
  canEdit: boolean;
  canMessage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const total = suggestions.length + chats.length + followUps.length;

  function run(action: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(success);
          router.refresh();
        } else {
          toast.error(result.error ?? "Something went wrong. Please try again.");
        }
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  }

  if (total === 0) return null;

  const defaultTab = followUps.length
    ? "follow-ups"
    : suggestions.length
      ? "quotes"
      : "chats";

  return (
    <Card data-testid="messenger-todo">
      <CardHeader>
        <CardTitle>Messenger to-do ({total})</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="follow-ups">Follow up today ({followUps.length})</TabsTrigger>
            <TabsTrigger value="quotes">Mark as Quotation? ({suggestions.length})</TabsTrigger>
            <TabsTrigger value="chats">Chats not matched yet ({chats.length})</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------- follow-ups */}
          <TabsContent value="follow-ups" className="flex flex-col gap-3 pt-3">
            <p className="text-sm text-muted-foreground">
              These leads have no email, so send their follow-up in Messenger: copy the
              message, open the chat, paste and send, then mark it sent. Meta only allows
              replies up to 7 days after their last message.
            </p>
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to send today.</p>
            ) : (
              followUps.map((item) => (
                <div
                  key={item.contactId}
                  data-testid="messenger-follow-up"
                  className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/crm/${item.contactId}`} className="font-semibold hover:underline">
                      {item.name}
                    </Link>
                    <Badge variant="outline">
                      {FOLLOW_UP_SEQUENCE_LABELS[item.sequence]} · {item.step} of{" "}
                      {MESSENGER_FOLLOW_UP_GAP_DAYS.length}
                    </Badge>
                  </div>
                  <p className="rounded-md bg-muted/50 p-2 text-sm">{item.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(item.message);
                          toast.success("Message copied.");
                        } catch {
                          toast.error("Couldn't copy. Select the text and copy it.");
                        }
                      }}
                    >
                      <CopyIcon className="size-4" />
                      Copy message
                    </Button>
                    {item.chatUrl ? (
                      <a
                        href={item.chatUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <ExternalLinkIcon className="size-4" />
                        Open chat
                      </a>
                    ) : null}
                    {canMessage ? (
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() => markMessengerFollowUpSent(item.contactId), `Marked as sent for ${item.name}.`)
                        }
                      >
                        <CheckIcon className="size-4" />
                        Mark as sent
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* ---------------------------------------------- quote suggestions */}
          <TabsContent value="quotes" className="flex flex-col gap-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Staff sent a picture in these chats (usually a package poster). Confirm if it
              was a quote.
            </p>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to confirm.</p>
            ) : (
              suggestions.map((item) => (
                <div
                  key={item.contactId}
                  data-testid="quote-suggestion"
                  className="flex flex-wrap items-center gap-2 rounded-lg p-3 ring-1 ring-foreground/10"
                >
                  <Link href={`/admin/crm/${item.contactId}`} className="font-semibold hover:underline">
                    {item.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">picture sent {ago(item.at)}</span>
                  <div className="flex-1" />
                  {canEdit ? (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() => confirmQuoteSuggestion(item.contactId), `${item.name} moved to Quotation.`)
                        }
                      >
                        <CheckIcon className="size-4" />
                        Yes, Quotation
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => run(() => dismissQuoteSuggestion(item.contactId), "Dismissed.")}
                      >
                        <XIcon className="size-4" />
                        Not a quote
                      </Button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </TabsContent>

          {/* ---------------------------------------------- unmatched chats */}
          <TabsContent value="chats" className="flex flex-col gap-3 pt-3">
            <p className="text-sm text-muted-foreground">
              People who messaged the Page but aren&apos;t matched to a lead yet. Match each
              chat so its replies and quotes are tracked.
            </p>
            {chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">All chats are matched.</p>
            ) : (
              chats.map((chat) => (
                <UnmatchedChatRow
                  key={chat.psid}
                  chat={chat}
                  leads={leads}
                  canEdit={canEdit}
                  isPending={isPending}
                  run={run}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function UnmatchedChatRow({
  chat,
  leads,
  canEdit,
  isPending,
  run,
}: {
  chat: UnmatchedChatItem;
  leads: LeadOption[];
  canEdit: boolean;
  isPending: boolean;
  run: (action: () => Promise<ActionResult>, success: string) => void;
}) {
  const [lead, setLead] = useState<LeadOption | null>(null);
  const canCreate = useCan("leads", "create");
  const name = chat.name ?? "Unknown name";

  return (
    <div
      data-testid="unmatched-chat"
      className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{name}</span>
        {chat.snippet ? (
          <span className="text-sm text-muted-foreground">&ldquo;{chat.snippet}&rdquo;</span>
        ) : null}
        <span className="text-sm text-muted-foreground">{ago(chat.lastInboundAt)}</span>
        {chat.chatUrl ? (
          <a
            href={chat.chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Open chat
          </a>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-xs">
            <Combobox
              items={leads}
              value={lead}
              onValueChange={(value) => setLead(value as LeadOption | null)}
              itemToStringLabel={(option: LeadOption) =>
                option.detail ? `${option.name} (${option.detail})` : option.name
              }
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Find the lead..." aria-label={`Lead for ${name}`} />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxPortal>
                <ComboboxPositioner>
                  <ComboboxPopup>
                    <ComboboxEmpty>No leads found.</ComboboxEmpty>
                    <ComboboxList>
                      {(option: LeadOption) => (
                        <ComboboxItem key={option.id} value={option}>
                          {option.detail ? `${option.name} (${option.detail})` : option.name}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxPopup>
                </ComboboxPositioner>
              </ComboboxPortal>
            </Combobox>
          </div>
          <Button
            size="sm"
            disabled={!lead || isPending}
            onClick={() =>
              lead && run(() => matchChatToLead(chat.psid, lead.id), `Chat matched to ${lead.name}.`)
            }
          >
            Match to lead
          </Button>
          {canCreate ? (
            <>
              <span className="text-sm text-muted-foreground">or</span>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => addLeadFromChat(chat.psid), `${name} added as a new lead.`)}
              >
                Add as new lead
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => markChatNotALead(chat.psid), "Marked as not a lead.")}
          >
            Not a lead
          </Button>
        </div>
      ) : null}
    </div>
  );
}
