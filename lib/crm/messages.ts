export const MESSAGE_CHANNELS = ["email", "sms"] as const;

export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_STATUSES = ["sent", "failed"] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  email: "Emailed",
  sms: "Texted",
};

// Only merge-tag supported for message bodies (bulk email personalization,
// 04-RESEARCH.md Pattern 3) -- no rich-text/template library per Claude's
// Discretion.
export function applyNameTemplate(body: string, name: string): string {
  return body.replaceAll("{{name}}", name);
}
