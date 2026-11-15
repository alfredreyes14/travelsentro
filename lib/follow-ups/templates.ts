/**
 * Lead follow-up copy and cadence. Pure (no server imports), so the compose
 * dialog can pre-fill from the same text the daily automation sends.
 *
 * Two sequences, picked by the contact's stage (follow_up_sequence_for() in
 * the lead_follow_ups migration):
 *   no_reply  B2C lead at New who never replied: get them talking
 *   quote     B2C lead at Quotation who went quiet: get them to reserve
 * Contacts at any other stage (and B2B) get no_reply copy when staff
 * follow up by hand.
 *
 * Every follow-up has its own angle. Steps 1-4 are the automatic sequence;
 * follow-ups staff send after that rotate through the sequence's extras.
 * The angles come from real customer chats: travellers are asked how many
 * are going and when, popular departures sell out, people ask about
 * add-ons, surcharges and payment, and reserving needs passport copies.
 *
 * Bodies keep the {{name}} merge tag (lib/crm/messages.ts applyNameTemplate)
 * so staff can edit a pre-filled draft and still send it to many contacts.
 */

export const FOLLOW_UP_SEQUENCES = ["no_reply", "quote"] as const;

export type FollowUpSequence = (typeof FOLLOW_UP_SEQUENCES)[number];

export const FOLLOW_UP_SEQUENCE_LABELS: Record<FollowUpSequence, string> = {
  no_reply: "No reply yet",
  quote: "Quote follow-up",
};

export function toFollowUpSequence(value: string | null | undefined): FollowUpSequence {
  return value === "quote" ? "quote" : "no_reply";
}

/** Mirrors follow_up_sequence_for() in SQL. */
export function followUpSequenceFor(
  clientType: string,
  stage: string
): FollowUpSequence {
  return clientType === "b2c" && stage === "quotation" ? "quote" : "no_reply";
}

export type FollowUpTemplate = { subject: string; body: string };

export type FollowUpAngle = {
  /** Short name staff see, e.g. "Travel dates". */
  label: string;
  email: (trip: string) => FollowUpTemplate;
  /** Text message. The tracked chat link is appended on send. */
  sms: string;
};

/**
 * Days to wait before each automatic step, counted from the previous
 * follow-up (step 1: from when the contact entered the stage). Emails land
 * on day 1, 4, 9 and 19. A contact who never clicks moves to Lost
 * LOST_AFTER_DAYS after the last one (close_unconverted_follow_ups()).
 */
export const FOLLOW_UP_GAP_DAYS = [1, 3, 5, 10] as const;

export const FOLLOW_UP_STEP_COUNT = FOLLOW_UP_GAP_DAYS.length;

/** Days after the last follow-up before a contact who never clicked moves to Lost. */
export const LOST_AFTER_DAYS = 3;

type SequenceCopy = {
  /** One per automatic step (FOLLOW_UP_STEP_COUNT). */
  steps: readonly FollowUpAngle[];
  /** Follow-ups staff send after the last step, in rotation. */
  extras: readonly FollowUpAngle[];
};

export const FOLLOW_UP_COPY: Record<FollowUpSequence, SequenceCopy> = {
  no_reply: {
    steps: [
      {
        label: "Group size and dates",
        email: (trip) => ({
          subject: `{{name}}, let's check dates for ${trip}`,
          body:
            `Thanks for your interest in ${trip}! To find the best options for you, we just need two things: how many people are traveling, and your preferred travel dates.\n\n` +
            "Tap below to chat with us and we'll reply with available dates and prices.",
        }),
        sms: "Hi {{name}}! TravelSentro here. How many are traveling, and when? Chat with us for dates and prices:",
      },
      {
        label: "Dates fill up",
        email: (trip) => ({
          subject: "Popular travel dates fill up fast",
          body:
            `Our tours leave on fixed departure dates, and popular ones — especially around holidays — can fill up weeks ahead.\n\n` +
            `Send us your preferred dates for ${trip} and we'll check what's still open, or suggest the closest available date.`,
        }),
        sms: "Hi {{name}}, popular tour dates fill up fast. Send us your preferred dates and we'll check slots:",
      },
      {
        label: "Help choosing",
        email: (trip) => ({
          subject: "Need help choosing a trip?",
          body:
            `Still deciding on ${trip}? Tell us your budget, your dates and who's coming along, and we'll suggest options that fit.\n\n` +
            "It only takes a minute on chat.",
        }),
        sms: "Hi {{name}}, not sure which trip fits your budget? Tell us and we'll suggest options. Chat with us:",
      },
      {
        label: "Last check-in",
        email: (trip) => ({
          subject: "Still thinking about your trip?",
          body:
            `This is our last check-in about ${trip} for now. If you're still interested, tap below and a travel consultant will take it from there.\n\n` +
            "If now isn't the right time, no worries — we won't keep reminding you.",
        }),
        sms: "Hi {{name}}, our last check-in for now from TravelSentro. Still keen on your trip? Chat with us:",
      },
    ],
    extras: [
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
            `Thinking of making ${trip} a group trip? We arrange trips for families, friends and teams.\n\n` +
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
    ],
  },
  quote: {
    steps: [
      {
        label: "Ready to reserve",
        email: (trip) => ({
          subject: `Ready to reserve ${trip}?`,
          body:
            `Thanks for considering ${trip}. When you're ready, reserving is simple: send us a copy of the passport of everyone traveling, and we'll secure your slots.\n\n` +
            "Tap below to send them on chat.",
        }),
        sms: "Hi {{name}}, ready to reserve your trip? Just send passport copies of all travelers on chat:",
      },
      {
        label: "Slots are limited",
        email: (trip) => ({
          subject: "Slots for your travel date are limited",
          body:
            `Each departure has a limited number of slots, and they can sell out anytime. If you'd like to lock in your date for ${trip}, let us know today and we'll check availability.\n\n` +
            "If your dates have changed, tell us — we can check other departures too.",
        }),
        sms: "Hi {{name}}, slots for your travel date are limited and can sell out. Chat with us to lock yours in:",
      },
      {
        label: "Questions before booking",
        email: (trip) => ({
          subject: "Any questions before you book?",
          body:
            `Before you book ${trip}, you might be wondering about optional add-ons, surcharges, what's included, or how payment works.\n\n` +
            "Ask us anything on chat and we'll walk you through it.",
        }),
        sms: "Hi {{name}}, questions about add-ons, surcharges or payment before booking? Chat with us:",
      },
      {
        label: "Last check-in",
        email: (trip) => ({
          subject: "Should we still hold your quote?",
          body:
            `This is our last check-in about your quote for ${trip}. If you'd still like to go, tap below and we'll check if slots are still available.\n\n` +
            "If your plans have changed, no worries — we won't keep reminding you.",
        }),
        sms: "Hi {{name}}, last check-in on your TravelSentro quote. Still planning to go? Chat with us:",
      },
    ],
    extras: [
      {
        label: "Other dates",
        email: (trip) => ({
          subject: "Would other dates work for you?",
          body:
            `If your original dates for ${trip} no longer work, we may have other departures that do.\n\n` +
            "Tell us what dates you're considering and we'll check slots for you.",
        }),
        sms: "Hi {{name}}, if your dates changed, we may have other departures. Chat with us to check:",
      },
      {
        label: "Travel documents",
        email: (trip) => ({
          subject: "Need help with travel documents?",
          body:
            `Not sure what documents ${trip} needs, or whether you need a visa? We can guide you through the requirements.\n\n` +
            "Chat with us and we'll tell you exactly what to prepare.",
        }),
        sms: "Hi {{name}}, unsure about visas or documents for your trip? TravelSentro can guide you. Chat with us:",
      },
      {
        label: "Adding travelers",
        email: (trip) => ({
          subject: "Bringing more people along?",
          body:
            `If more family or friends want to join ${trip}, let us know — we'll check slots for the whole group.\n\n` +
            "Chat with us with the updated number of travelers.",
        }),
        sms: "Hi {{name}}, more people joining your trip? Send us the updated headcount on chat:",
      },
      {
        label: "Plan ahead",
        email: (trip) => ({
          subject: "Planning for the next long weekend?",
          body:
            `If ${trip} doesn't fit this time, we can plan ahead for an upcoming holiday or long weekend. Booking early gives you more choice.\n\n` +
            "Chat with us and we'll check what's open.",
        }),
        sms: "Hi {{name}}, planning for the next holiday or long weekend? Book early for more choices. Chat with us:",
      },
    ],
  },
};

/** The angle for a follow-up number (1, 2, ...) in a sequence. */
export function followUpAngle(
  sequence: FollowUpSequence,
  step: number
): FollowUpAngle {
  const { steps, extras } = FOLLOW_UP_COPY[sequence];
  const n = Math.max(1, Math.floor(step));
  if (n <= steps.length) return steps[n - 1];
  return extras[(n - steps.length - 1) % extras.length];
}

function tripPhrase(sequence: FollowUpSequence, packageName?: string | null): string {
  const name = packageName?.trim();
  if (name) return `your ${name} trip`;
  return sequence === "quote" ? "your trip" : "your next trip";
}

export function followUpEmailTemplate(
  sequence: FollowUpSequence,
  step: number,
  packageName?: string | null
): FollowUpTemplate {
  return followUpAngle(sequence, step).email(tripPhrase(sequence, packageName));
}

export function followUpSmsTemplate(sequence: FollowUpSequence, step: number): string {
  return followUpAngle(sequence, step).sms;
}

/** Characters the appended link adds: a space plus https://<host>/go/<16-char token>. */
export function trackedLinkLength(origin: string): number {
  return 1 + `${origin}/go/`.length + 16;
}
