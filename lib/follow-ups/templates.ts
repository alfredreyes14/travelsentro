/**
 * Lead follow-up copy and cadence. Pure (no server imports), so the compose
 * dialog can pre-fill from the same text the daily automation sends.
 *
 * Every follow-up has its own angle, so a lead never gets the same message
 * twice in a row: steps 1-4 are the automatic sequence, and follow-ups staff
 * send after that rotate through EXTRA_ANGLES.
 *
 * Bodies keep the {{name}} merge tag (lib/crm/messages.ts applyNameTemplate)
 * so staff can edit a pre-filled draft and still send it to many contacts.
 */

export type FollowUpTemplate = { subject: string; body: string };

export type FollowUpAngle = {
  /** Short name staff see, e.g. "Travel dates". */
  label: string;
  email: (trip: string) => FollowUpTemplate;
  /** Text message. The tracked chat link is appended on send. */
  sms: string;
};

/**
 * The automatic sequence. Each gap is counted from the previous follow-up:
 * emails land on day 1, 4, 9 and 19 after the lead came in. A lead who never
 * clicks is moved to Lost LOST_AFTER_DAYS after the last one
 * (close_unconverted_follow_ups()).
 */
export const FOLLOW_UP_STEPS: readonly (FollowUpAngle & { gapDays: number })[] = [
  {
    gapDays: 1,
    label: "Let's plan your trip",
    email: (trip) => ({
      subject: `{{name}}, let's plan ${trip}`,
      body:
        `Thanks for your interest in TravelSentro! We'd love to help you plan ${trip}.\n\n` +
        "Tap the button below to chat with our travel team. We can answer your questions, check available dates, and send you a quote — no commitment.",
    }),
    sms: "Hi {{name}}! TravelSentro here. Ready to plan your trip? Chat with us for dates and a free quote:",
  },
  {
    gapDays: 3,
    label: "Travel dates",
    email: (trip) => ({
      subject: "Have you picked your travel dates?",
      body:
        `Just checking in about ${trip}. Popular dates fill up fast, so if you already have dates in mind, send them our way and we'll check availability for you.\n\n` +
        "Chat with us below — we usually reply within the day.",
    }),
    sms: "Hi {{name}}, have you picked your travel dates? Popular dates fill up fast. Chat with us to check:",
  },
  {
    gapDays: 5,
    label: "Help choosing",
    email: (trip) => ({
      subject: "Need help choosing?",
      body:
        `Still deciding on ${trip}? Tell us your budget, your dates and who's coming along, and we'll suggest options that fit — including custom trips built around you.\n\n` +
        "It only takes a minute on chat.",
    }),
    sms: "Hi {{name}}, not sure which trip fits your budget? Tell us and we'll suggest options. Chat with us:",
  },
  {
    gapDays: 10,
    label: "Last check-in",
    email: (trip) => ({
      subject: "Still thinking about your trip?",
      body:
        `This is our last check-in about ${trip} for now. If you're still interested, tap below and a travel consultant will take it from there.\n\n` +
        "If now isn't the right time, no worries — we won't keep reminding you.",
    }),
    sms: "Hi {{name}}, our last check-in for now from TravelSentro. Still keen on your trip? Chat with us:",
  },
];

/** Follow-ups staff send after the automatic sequence, in rotation. */
export const EXTRA_ANGLES: readonly FollowUpAngle[] = [
  {
    label: "Questions answered",
    email: (trip) => ({
      subject: "Any questions we can answer?",
      body:
        `Sometimes a few questions stand between you and ${trip} — what's included, how payment works, or what documents you'll need.\n\n` +
        "Ask us anything on chat. A travel consultant will walk you through it.",
    }),
    sms: "Hi {{name}}, questions about inclusions, payment or requirements? TravelSentro can help. Chat with us:",
  },
  {
    label: "Group trip",
    email: (trip) => ({
      subject: "Bringing family or friends?",
      body:
        `Thinking of making ${trip} a group trip? We arrange trips for families, barkadas and teams, and can tailor the itinerary so everyone enjoys it.\n\n` +
        "Tell us who's coming and we'll put together options.",
    }),
    sms: "Hi {{name}}, traveling with family or friends? TravelSentro arranges group trips. Chat with us:",
  },
  {
    label: "Visa help",
    email: (trip) => ({
      subject: "Need a visa for your trip?",
      body:
        `If ${trip} needs a visa, we can help with that too — from the requirements list to your application.\n\n` +
        "Chat with us and we'll tell you exactly what you need.",
    }),
    sms: "Hi {{name}}, need a visa for your trip? TravelSentro also helps with visa applications. Chat with us:",
  },
  {
    label: "Plan ahead",
    email: (trip) => ({
      subject: "Planning for the next long weekend?",
      body:
        `If ${trip} is for an upcoming holiday or long weekend, booking early gives you more choice of flights and hotels.\n\n` +
        "Chat with us and we'll check what's still open for your dates.",
    }),
    sms: "Hi {{name}}, planning for the next holiday or long weekend? Book early for more choices. Chat with us:",
  },
];

/** Days after the last follow-up before a lead who never clicked moves to Lost. */
export const LOST_AFTER_DAYS = 3;

export const FOLLOW_UP_GAP_DAYS = FOLLOW_UP_STEPS.map((step) => step.gapDays);

export const FOLLOW_UP_STEP_COUNT = FOLLOW_UP_STEPS.length;

/** The angle for a follow-up number (1, 2, ...). */
export function followUpAngle(step: number): FollowUpAngle {
  const n = Math.max(1, Math.floor(step));
  if (n <= FOLLOW_UP_STEP_COUNT) return FOLLOW_UP_STEPS[n - 1];
  return EXTRA_ANGLES[(n - FOLLOW_UP_STEP_COUNT - 1) % EXTRA_ANGLES.length];
}

function tripPhrase(packageName?: string | null): string {
  const name = packageName?.trim();
  return name ? `your ${name} trip` : "your next trip";
}

export function followUpEmailTemplate(
  step: number,
  packageName?: string | null
): FollowUpTemplate {
  return followUpAngle(step).email(tripPhrase(packageName));
}

export function followUpSmsTemplate(step: number): string {
  return followUpAngle(step).sms;
}

/** Characters the appended link adds: a space plus https://<host>/go/<16-char token>. */
export function trackedLinkLength(origin: string): number {
  return 1 + `${origin}/go/`.length + 16;
}
