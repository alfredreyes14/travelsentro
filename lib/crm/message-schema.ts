import { z } from "zod";

// Shared server+client zod validation for actions/messages.ts's Server
// Actions (04-03) -- mirrors lib/crm/inquiry-schema.ts's
// `z.object({...}); export type X = z.infer<typeof schema>;` shape. Every
// action re-runs safeParse() server-side even though message-compose-dialog.tsx
// also validates client-side, closing 03-REVIEW.md's WR-01 client-only-
// validation gap for this phase's new actions (T-04-13).
export const emailComposeSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export type EmailComposeValues = z.infer<typeof emailComposeSchema>;

// ~918 chars is a generous ~6 SMS-segment cap (Semaphore has no documented
// hard length limit, this is a sane app-side guard).
export const smsComposeSchema = z.object({
  body: z.string().min(1).max(918),
});

export type SmsComposeValues = z.infer<typeof smsComposeSchema>;

export const recipientIdsSchema = z.array(z.uuid()).min(1).max(500);
