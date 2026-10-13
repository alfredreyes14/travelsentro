import { z } from "zod";

import { CLIENT_TYPES, isStageForType } from "./stage";
import { SERVICE_KEYS, toServiceKeys } from "./services";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from "./tags";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const labeledValueSchema = z.object({
  label: z.string().trim().max(40, "Keep the label under 40 characters"),
  value: z.string().trim().max(254),
});

export type LabeledValue = z.infer<typeof labeledValueSchema>;

/**
 * Every editable contact field, in the form's all-strings shape ("" means
 * unset). One schema serves both client types: the form shows only the
 * fields for the contact's type and passes the rest through unchanged, so
 * converting a contact never loses the other type's data.
 */
export const contactFormSchema = z
  .object({
    name: z.string().trim().min(1, "Please enter a name").max(200),
    email: z.string().trim().toLowerCase().max(254),
    phone: z.string().trim().max(40),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(MAX_TAG_LENGTH, `Keep each tag under ${MAX_TAG_LENGTH} characters`)
      )
      .max(MAX_TAGS, `A contact can have up to ${MAX_TAGS} tags`),
    servicesAvailed: z.array(z.enum(SERVICE_KEYS)),
    servicesOther: z
      .string()
      .trim()
      .max(500, "Keep this under 500 characters"),
    repName: z.string().trim().max(200),
    repPosition: z.string().trim().max(200),
    otherEmails: z.array(labeledValueSchema).max(10, "Up to 10 extra emails"),
    otherPhones: z.array(labeledValueSchema).max(10, "Up to 10 extra numbers"),
    contractStart: z.string().trim(),
    contractEnd: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.email && !EMAIL_PATTERN.test(values.email)) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Please enter a valid email address",
      });
    }
    if (!values.email && !values.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter an email address or a phone number",
      });
    }
    if (values.servicesAvailed.includes("other") && !values.servicesOther) {
      ctx.addIssue({
        code: "custom",
        path: ["servicesOther"],
        message: "Please describe the other service",
      });
    }
    values.otherEmails.forEach((entry, index) => {
      if (!EMAIL_PATTERN.test(entry.value)) {
        ctx.addIssue({
          code: "custom",
          path: ["otherEmails", index, "value"],
          message: "Please enter a valid email address",
        });
      }
    });
    values.otherPhones.forEach((entry, index) => {
      if (!entry.value) {
        ctx.addIssue({
          code: "custom",
          path: ["otherPhones", index, "value"],
          message: "Please enter a number",
        });
      }
    });
    for (const field of ["contractStart", "contractEnd"] as const) {
      if (values[field] && !DATE_PATTERN.test(values[field])) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Please pick a date",
        });
      }
    }
    if (
      DATE_PATTERN.test(values.contractStart) &&
      DATE_PATTERN.test(values.contractEnd) &&
      values.contractEnd < values.contractStart
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["contractEnd"],
        message: "The contract can't end before it starts",
      });
    }
  });

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const EMPTY_CONTACT_VALUES: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  tags: [],
  servicesAvailed: [],
  servicesOther: "",
  repName: "",
  repPosition: "",
  otherEmails: [],
  otherPhones: [],
  contractStart: "",
  contractEnd: "",
};

/** A stored other_emails / other_phones jsonb value, with anything malformed dropped. */
export function parseLabeledList(json: unknown): LabeledValue[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as LabeledValue).value === "string"
    ) {
      const { label, value } = entry as LabeledValue;
      return [{ label: typeof label === "string" ? label : "", value }];
    }
    return [];
  });
}

/** The contacts columns the form owns, as stored. */
export type ContactRowFields = {
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  services_availed: string[];
  services_other: string | null;
  rep_name: string | null;
  rep_position: string | null;
  other_emails: unknown;
  other_phones: unknown;
  contract_start: string | null;
  contract_end: string | null;
};

export function contactRowToFormValues(row: ContactRowFields): ContactFormValues {
  return {
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    tags: row.tags,
    servicesAvailed: toServiceKeys(row.services_availed),
    servicesOther: row.services_other ?? "",
    repName: row.rep_name ?? "",
    repPosition: row.rep_position ?? "",
    otherEmails: parseLabeledList(row.other_emails),
    otherPhones: parseLabeledList(row.other_phones),
    contractStart: row.contract_start ?? "",
    contractEnd: row.contract_end ?? "",
  };
}

/**
 * Parsed form values as contacts columns. Blank strings become null, tags
 * are normalised against the tags already in use, and the Other text is
 * cleared unless Other is ticked.
 */
export function contactValuesToRow(
  values: ContactFormValues,
  existingTags: readonly string[]
) {
  return {
    name: values.name,
    email: values.email || null,
    phone: values.phone || null,
    tags: normalizeTags(values.tags, existingTags),
    services_availed: values.servicesAvailed,
    services_other: values.servicesAvailed.includes("other")
      ? values.servicesOther
      : null,
    rep_name: values.repName || null,
    rep_position: values.repPosition || null,
    other_emails: values.otherEmails,
    other_phones: values.otherPhones,
    contract_start: values.contractStart || null,
    contract_end: values.contractEnd || null,
  };
}

/** Switching a contact's type: the stage must belong to the new type. */
export const convertSchema = z
  .object({
    clientType: z.enum(CLIENT_TYPES),
    stage: z.string(),
  })
  .refine((values) => isStageForType(values.clientType, values.stage), {
    path: ["stage"],
    message: "Pick a stage from this pipeline",
  });
