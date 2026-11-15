"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import { linkMessengerChat, unlinkMessengerChat } from "@/actions/messenger-link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MessengerChatOption = {
  psid: string;
  name: string | null;
  snippet: string | null;
  lastInboundAt: string | null;
  /** Opens the chat in the Facebook inbox. */
  chatUrl: string | null;
};

function describe(chat: MessengerChatOption): string {
  const when = chat.lastInboundAt
    ? formatDistanceToNow(new Date(chat.lastInboundAt), { addSuffix: true })
    : null;
  return [chat.name ?? "Unknown name", chat.snippet && `"${chat.snippet}"`, when]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The contact's Messenger chat: linked (with an "Open chat" button; their
 * replies and staff's saved replies there update the stage), or a picker
 * of recent chats nobody linked yet.
 */
export function ContactMessengerLink({
  contactId,
  linkedChat,
  unlinkedChats,
  canEdit,
}: {
  contactId: string;
  linkedChat: MessengerChatOption | null;
  unlinkedChats: MessengerChatOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(success);
          setPicked(null);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Couldn't update the Messenger link. Please try again.");
      }
    });
  }

  if (linkedChat) {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-muted-foreground">Messenger chat: </span>
        <span>{linkedChat.name ?? "Linked"}</span>
        {linkedChat.chatUrl ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={linkedChat.chatUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLinkIcon className="size-4" />
            Open chat
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => unlinkMessengerChat(contactId), "Messenger chat unlinked.")}
          >
            Unlink
          </Button>
        ) : null}
        <p className="w-full text-xs text-muted-foreground">
          When they reply there, they move to Inquiry. Staff saved replies set
          in Messenger settings move them further.
        </p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <p className="pt-2">
        <span className="text-muted-foreground">Messenger chat: </span>not linked
      </p>
    );
  }

  const items = Object.fromEntries(unlinkedChats.map((c) => [c.psid, describe(c)]));

  return (
    <div className="flex flex-col gap-1.5 pt-2">
      <span className="text-muted-foreground">Messenger chat: not linked</span>
      {unlinkedChats.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No unlinked chats yet. Chats are linked automatically when the lead&apos;s
          email or phone appears in the chat, or when they tap &ldquo;Chat on
          Messenger&rdquo; in a follow-up.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select items={items} value={picked} onValueChange={(v) => setPicked(v as string)}>
            <SelectTrigger aria-label="Messenger chat" className="w-full max-w-md">
              <SelectValue placeholder="Pick their chat" />
            </SelectTrigger>
            <SelectContent>
              {unlinkedChats.map((chat) => (
                <SelectItem key={chat.psid} value={chat.psid}>
                  {describe(chat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!picked || isPending}
            onClick={() =>
              picked && run(() => linkMessengerChat(contactId, picked), "Messenger chat linked.")
            }
          >
            Link
          </Button>
        </div>
      )}
    </div>
  );
}
