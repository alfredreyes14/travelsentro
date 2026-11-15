/**
 * Lead follow-up copy and cadence. Pure (no server imports), so the compose
 * dialog can pre-fill from the same text the daily automation sends.
 *
 * Bodies keep the {{name}} merge tag (lib/crm/messages.ts applyNameTemplate)
 * so staff can edit a pre-filled draft and still send it to many contacts.
 */

export type FollowUpTemplate = { subject: string; body: string };

type Step = {
  /** Days to wait before this step: after the lead came in (step 1) or after the previous follow-up. */
  gapDays: number;
  email: (trip: string) => FollowUpTemplate;
};

/** Day 1, day 3, day 7 after the lead came in. */
export const FOLLOW_UP_STEPS: readonly Step[] = [
  {
    gapDays: 1,
    email: (trip) => ({
      subject: `{{name}}, let's plan ${trip}`,
      body:
        `Thanks for your interest in TravelSentro! We'd love to help you plan ${trip}.\n\n` +
        "Tap the button below to chat with our travel team. We can answer your questions, check available dates, and send you a quote — no commitment.",
    }),
  },
  {
    gapDays: 2,
    email: (trip) => ({
      subject: "Have you picked your travel dates?",
      body:
        `Just checking in about ${trip}. Popular dates fill up fast, so if you already have dates in mind, send them our way and we'll check availability for you.\n\n` +
        "Chat with us below — we usually reply within the day.",
    }),
  },
  {
    gapDays: 4,
    email: (trip) => ({
      subject: "Still thinking about your trip?",
      body:
        `This is our last check-in about ${trip}. If you're still interested, tap below and a travel consultant will take it from there.\n\n` +
        "If now isn't the right time, no worries — we won't send more reminders about this inquiry.",
    }),
  },
];

export const FOLLOW_UP_GAP_DAYS = FOLLOW_UP_STEPS.map((step) => step.gapDays);

export const FOLLOW_UP_STEP_COUNT = FOLLOW_UP_STEPS.length;

function tripPhrase(packageName?: string | null): string {
  const name = packageName?.trim();
  return name ? `your ${name} trip` : "your next trip";
}

/**
 * The email for a step. Steps past the last one reuse the last step's copy
 * (staff can still send a manual follow-up after the automation is done).
 */
export function followUpEmailTemplate(
  step: number,
  packageName?: string | null
): FollowUpTemplate {
  const index = Math.min(Math.max(step, 1), FOLLOW_UP_STEP_COUNT) - 1;
  return FOLLOW_UP_STEPS[index].email(tripPhrase(packageName));
}

/** SMS draft. The tracked chat link is appended on send, not typed here. */
export const FOLLOW_UP_SMS_TEMPLATE =
  "Hi {{name}}, this is TravelSentro following up on your travel inquiry. Chat with our team on Messenger for dates and a free quote:";

/** Characters the appended link adds: a space plus https://<host>/go/<16-char token>. */
export function trackedLinkLength(origin: string): number {
  return 1 + `${origin}/go/`.length + 16;
}
