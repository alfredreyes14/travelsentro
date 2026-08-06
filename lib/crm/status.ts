export const CONTACT_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const STATUS_BADGE_VARIANT: Record<
  ContactStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  new: "default",
  contacted: "outline",
  qualified: "secondary",
  won: "secondary",
  lost: "destructive",
};

// Won's green (#16A34A / Tailwind green-600) is applied via this utility-class
// override on top of the `secondary` variant, never as a new badge.tsx `cva`
// variant (03-UI-SPEC.md's explicit instruction to avoid growing the shared
// Badge component's variant surface for a single-phase need).
export const STATUS_BADGE_CLASSNAME: Partial<Record<ContactStatus, string>> = {
  won: "bg-green-600 text-white border-transparent hover:bg-green-600/90",
};
