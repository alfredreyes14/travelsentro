import {
  FOLLOW_UP_SEQUENCE_LABELS,
  FOLLOW_UP_STEP_COUNT,
  toFollowUpSequence,
  type FollowUpSequence,
} from "./templates";

/**
 * Where a contact is in its current follow-up sequence (the
 * follow_up_progress view), turned into the badge staff see next to the
 * stage. Pure, so the list and the contact page share it.
 */

export type FollowUpProgress = {
  sequence: FollowUpSequence;
  /** Follow-ups sent in this sequence since the contact entered its stage. */
  sentCount: number;
  clicked: boolean;
};

export type FollowUpBadge = {
  label: string;
  tone: "active" | "clicked" | "done";
  /** Longer explanation for a tooltip. */
  detail: string;
};

export function toFollowUpProgress(row: {
  sequence: string | null;
  sent_count: number | null;
  clicked: boolean | null;
}): FollowUpProgress {
  return {
    sequence: toFollowUpSequence(row.sequence),
    sentCount: row.sent_count ?? 0,
    clicked: row.clicked ?? false,
  };
}

/** True when the daily automation runs this contact's sequence. */
export function isAutomaticSequence(clientType: string, stage: string): boolean {
  return clientType === "b2c" && (stage === "new" || stage === "quotation");
}

export function followUpBadge(
  progress: FollowUpProgress | undefined,
  clientType: string,
  stage: string
): FollowUpBadge | null {
  if (!progress || progress.sentCount === 0) return null;
  const sequence = FOLLOW_UP_SEQUENCE_LABELS[progress.sequence];

  if (progress.clicked) {
    return {
      label: "Clicked to chat",
      tone: "clicked",
      detail: `Tapped a chat button in a follow-up (${sequence}). Automatic follow-ups stopped.`,
    };
  }

  if (!isAutomaticSequence(clientType, stage)) {
    const n = progress.sentCount;
    return {
      label: `${n} follow-up${n === 1 ? "" : "s"} sent`,
      tone: "active",
      detail: "Sent by staff. Automatic follow-ups only run for B2C contacts at New or Quotation.",
    };
  }

  if (progress.sentCount >= FOLLOW_UP_STEP_COUNT) {
    return {
      label: `All ${FOLLOW_UP_STEP_COUNT} follow-ups sent`,
      tone: "done",
      detail: `${sequence}: no tap yet. Moves to Lost 3 days after the last one unless they reply.`,
    };
  }

  return {
    label: `Following up ${progress.sentCount} of ${FOLLOW_UP_STEP_COUNT}`,
    tone: "active",
    detail: `${sequence}: the next follow-up goes out automatically.`,
  };
}

export const FOLLOW_UP_BADGE_CLASSNAME: Record<FollowUpBadge["tone"], string> = {
  active: "border-sky-200 bg-sky-50 text-sky-800",
  clicked: "border-green-200 bg-green-50 text-green-800",
  done: "border-gray-200 bg-gray-50 text-gray-700",
};
