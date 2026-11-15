import {
  B2B_STAGES,
  B2C_STAGES,
  STAGE_LABELS,
  type ContactStage,
} from "@/lib/crm/stage";

/**
 * The names CRM stages go by in Meta: the Messenger inbox labels staff see
 * on chats, and the event names Meta Ads receives. Same as the CRM's own
 * labels, except New, which is "New lead" so it can't be mistaken for an
 * inbox label someone already uses for something else.
 */
export const META_STAGE_NAMES: Record<ContactStage, string> = {
  ...STAGE_LABELS,
  new: "New lead",
};

/** Every stage's Meta name, B2C and B2B, without repeats. */
export const ALL_META_STAGE_NAMES: string[] = [
  ...new Set([...B2C_STAGES, ...B2B_STAGES].map((s) => META_STAGE_NAMES[s])),
];

const STAGE_BY_NAME = new Map<string, ContactStage>();
for (const stage of [...B2C_STAGES, ...B2B_STAGES]) {
  STAGE_BY_NAME.set(normalize(META_STAGE_NAMES[stage]), stage);
  STAGE_BY_NAME.set(normalize(STAGE_LABELS[stage]), stage);
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

/** The stage an inbox label stands for ("Quotation", "new lead"), or null for any other label. */
export function stageForLabel(name: string | null | undefined): ContactStage | null {
  if (!name) return null;
  return STAGE_BY_NAME.get(normalize(name)) ?? null;
}

/** True when a label name is one of ours (stage labels are kept one per chat). */
export function isStageLabel(name: string | null | undefined): boolean {
  return stageForLabel(name) !== null;
}

export function metaStageName(stage: string): string {
  return META_STAGE_NAMES[stage as ContactStage] ?? stage;
}

/** Meta's exact inbox_labels action values aren't documented; anything removal-like counts. */
export function isLabelRemoval(action: string | undefined): boolean {
  return /remove|delete|unassign/i.test(action ?? "");
}
