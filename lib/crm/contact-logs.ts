import { z } from "zod";

/**
 * Contacts staff make outside the admin panel (calls, chat apps, meetings),
 * logged by hand so a lead's "Last contact" date stays true. Emails and
 * SMS sent from the panel are tracked automatically (messages table).
 * Same list as the contact_logs.channel check constraint
 * (supabase/migrations/20261115120000_lead_contact_tracking.sql).
 */
export const CONTACT_LOG_CHANNELS = [
  "call",
  "whatsapp",
  "messenger",
  "viber",
  "in_person",
  "other",
] as const;

export type ContactLogChannel = (typeof CONTACT_LOG_CHANNELS)[number];

export const CONTACT_LOG_CHANNEL_LABELS: Record<ContactLogChannel, string> = {
  call: "Phone call",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  viber: "Viber",
  in_person: "In person",
  other: "Other",
};

export function toContactLogChannel(value: string): ContactLogChannel {
  return (CONTACT_LOG_CHANNELS as readonly string[]).includes(value)
    ? (value as ContactLogChannel)
    : "other";
}

export const contactLogSchema = z.object({
  channel: z.enum(CONTACT_LOG_CHANNELS),
  /** ISO timestamp; the dialog converts the picked local time. */
  contactedAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(2000),
});

export type ContactLogValues = z.infer<typeof contactLogSchema>;
