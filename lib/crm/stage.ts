/**
 * Client types and their stage pipelines. The same lists are enforced by
 * the contacts_stage_matches_type check constraint
 * (supabase/migrations/20261013120000_contacts_b2c_b2b.sql) -- change both
 * together.
 */
export const CLIENT_TYPES = ["b2c", "b2b"] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  b2c: "B2C",
  b2b: "B2B",
};

export function isClientType(value: unknown): value is ClientType {
  return (
    typeof value === "string" &&
    (CLIENT_TYPES as readonly string[]).includes(value)
  );
}

/** A client type read from the database; an unknown value reads as B2C. */
export function toClientType(value: string): ClientType {
  return isClientType(value) ? value : "b2c";
}

export const B2C_STAGES = [
  "new",
  "inquiry",
  "quotation",
  "confirmation",
  "lost",
] as const;

export const B2B_STAGES = [
  "new",
  "contacted",
  "follow_up",
  "discovery",
  "contract_review",
  "won",
  "lost",
] as const;

export type ContactStage =
  | (typeof B2C_STAGES)[number]
  | (typeof B2B_STAGES)[number];

export const STAGES_BY_TYPE: Record<ClientType, readonly ContactStage[]> = {
  b2c: B2C_STAGES,
  b2b: B2B_STAGES,
};

export const STAGE_LABELS: Record<ContactStage, string> = {
  new: "New",
  inquiry: "Inquiry",
  quotation: "Quotation",
  confirmation: "Confirmation",
  contacted: "Contacted",
  follow_up: "Follow-up",
  discovery: "Discovery",
  contract_review: "Contract Review",
  won: "Won",
  lost: "Lost",
};

// Applied on top of Badge's `outline` variant, never as new badge.tsx
// variants. Written out in full so Tailwind sees every class name.
export const STAGE_CHIP_CLASSNAME: Record<ContactStage, string> = {
  new: "border-blue-200 bg-blue-100 text-blue-800",
  inquiry: "border-violet-200 bg-violet-100 text-violet-800",
  quotation: "border-amber-200 bg-amber-100 text-amber-800",
  confirmation: "border-green-200 bg-green-100 text-green-800",
  contacted: "border-cyan-200 bg-cyan-100 text-cyan-800",
  follow_up: "border-amber-200 bg-amber-100 text-amber-800",
  discovery: "border-violet-200 bg-violet-100 text-violet-800",
  contract_review: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800",
  won: "border-green-200 bg-green-100 text-green-800",
  lost: "border-red-200 bg-red-100 text-red-800",
};

export function isStageForType(
  type: ClientType,
  stage: unknown
): stage is ContactStage {
  // A caller validating untrusted input may pass a type that is not a
  // ClientType at all, including names like "constructor" that a plain
  // lookup would find on the prototype.
  if (!isClientType(type) || typeof stage !== "string") return false;
  const stages: readonly string[] = STAGES_BY_TYPE[type];
  return stages.includes(stage);
}

/** A stage read from the database; a value outside the pipeline reads as New. */
export function toContactStage(type: ClientType, value: string): ContactStage {
  return isStageForType(type, value) ? value : "new";
}
