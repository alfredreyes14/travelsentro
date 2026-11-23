// "messenger": a follow-up staff sent by hand in Messenger and marked sent
// (actions/messenger-todo.ts). The CRM never sends Messenger messages itself.
export const MESSAGE_CHANNELS = ["email", "sms", "messenger"] as const;

export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_STATUSES = ["sent", "failed"] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  email: "Emailed",
  sms: "Texted",
  messenger: "Messaged on Messenger",
};

// Only merge-tag supported for message bodies (bulk email personalization,
// 04-RESEARCH.md Pattern 3) -- no rich-text/template library per Claude's
// Discretion.
export function applyNameTemplate(body: string, name: string): string {
  return body.replaceAll("{{name}}", name);
}
