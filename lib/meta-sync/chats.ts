/**
 * Turns Conversations API pages into the messages the sync acts on. Pure,
 * so scripts/verify-meta-sync.ts can check it without Meta.
 */

export type GraphConversation = {
  id: string;
  link?: string;
  updated_time: string;
  participants?: { data: { id: string; name?: string }[] };
  messages?: { data: { id: string; message?: string; created_time: string; from?: { id: string } }[] };
};

export type ChatMessage = {
  psid: string;
  name: string | null;
  chatLink: string | null;
  text: string;
  sentAt: string;
  fromCustomer: boolean;
};

/**
 * Messages sent after `since`, oldest first (so a chat's linking message is
 * handled before the reply that follows it). Messages with no text (photos,
 * stickers) are skipped.
 */
export function newMessages(
  conversations: GraphConversation[],
  pageId: string,
  since: Date
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const conversation of conversations) {
    const customer = conversation.participants?.data.find((p) => p.id !== pageId);
    if (!customer) continue;
    for (const message of conversation.messages?.data ?? []) {
      if (!message.message?.trim()) continue;
      if (new Date(message.created_time) <= since) continue;
      out.push({
        psid: customer.id,
        name: customer.name ?? null,
        chatLink: conversation.link ?? null,
        text: message.message,
        sentAt: message.created_time,
        fromCustomer: message.from?.id !== pageId,
      });
    }
  }
  return out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

/** Facebook inbox URL for a chat's link path ("/<page>/inbox/<id>/?section=messages"). */
export function chatUrl(chatLink: string | null | undefined): string | null {
  return chatLink && chatLink.startsWith("/") ? `https://www.facebook.com${chatLink}` : null;
}
