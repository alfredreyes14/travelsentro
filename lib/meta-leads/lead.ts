/**
 * Turns a raw Meta lead (Graph API `/{leadgen-id}`) into what
 * record_meta_lead() stores. Pure, no network, so
 * scripts/verify-meta-leads.ts can test it directly.
 */

export type MetaLeadField = { name: string; values?: string[] };

export type MetaLead = {
  id: string;
  created_time?: string;
  form_id?: string;
  field_data?: MetaLeadField[];
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
};

/** What the CRM keeps about where a lead came from (inquiries.source_details). */
export type MetaLeadDetails = {
  form_id?: string;
  form_name?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
};

export type ParsedMetaLead = {
  leadgenId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  message: string;
  details: MetaLeadDetails;
  createdAt: string | null;
};

// Meta's standard prefill question keys that map onto contact columns.
const EMAIL_KEYS = new Set(["email", "work_email"]);
const PHONE_KEYS = new Set(["phone_number", "phone", "work_phone_number"]);
const FULL_NAME_KEYS = new Set(["full_name", "name"]);

function firstValue(field: MetaLeadField | undefined): string | null {
  const value = field?.values?.find((v) => v.trim() !== "")?.trim();
  return value ?? null;
}

/**
 * "when_are_you_planning_to_travel?" -> "When are you planning to travel?".
 * Custom questions arrive keyed by a slug of the question text, not the
 * text itself.
 */
export function humanizeFieldName(name: string): string {
  const text = name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : name;
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ) as Partial<T>;
}

export function parseMetaLead(
  lead: MetaLead,
  formName?: string | null
): ParsedMetaLead {
  const fields = lead.field_data ?? [];
  const find = (keys: Set<string>) =>
    fields.find((f) => keys.has(f.name.toLowerCase()));

  const email = firstValue(find(EMAIL_KEYS));
  const phone = firstValue(find(PHONE_KEYS));

  let name = firstValue(find(FULL_NAME_KEYS));
  if (!name) {
    const first = firstValue(fields.find((f) => f.name === "first_name"));
    const last = firstValue(fields.find((f) => f.name === "last_name"));
    name = [first, last].filter(Boolean).join(" ") || null;
  }

  const used = new Set([
    ...EMAIL_KEYS,
    ...PHONE_KEYS,
    ...FULL_NAME_KEYS,
    "first_name",
    "last_name",
  ]);
  const answers = fields
    .filter((f) => !used.has(f.name.toLowerCase()))
    .map((f) => {
      const values = (f.values ?? []).map((v) => v.trim()).filter(Boolean);
      if (!values.length) return null;
      const label = humanizeFieldName(f.name);
      // "Travel month? January", not "Travel month?: January".
      const separator = /[?:]$/.test(label) ? " " : ": ";
      return `${label}${separator}${values.join(", ")}`;
    })
    .filter((line): line is string => line !== null);

  return {
    leadgenId: lead.id,
    email,
    name,
    phone,
    message: answers.join("\n"),
    details: compact({
      form_id: lead.form_id,
      form_name: formName ?? undefined,
      ad_id: lead.ad_id,
      ad_name: lead.ad_name,
      adset_name: lead.adset_name,
      campaign_id: lead.campaign_id,
      campaign_name: lead.campaign_name,
      platform: lead.platform,
      is_organic: lead.is_organic,
    }),
    createdAt: lead.created_time ?? null,
  };
}

/** The leadgen events in a Page webhook body (`entry[].changes[]`). */
export type LeadgenChange = {
  leadgen_id: string;
  form_id?: string;
  page_id?: string;
};

export function extractLeadgenChanges(payload: unknown): LeadgenChange[] {
  const entries = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return [];

  const result: LeadgenChange[] = [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] } | null)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = change as { field?: string; value?: Record<string, unknown> } | null;
      if (c?.field !== "leadgen" || !c.value) continue;
      const id = c.value.leadgen_id;
      if (typeof id !== "string" && typeof id !== "number") continue;
      result.push({
        leadgen_id: String(id),
        form_id: c.value.form_id != null ? String(c.value.form_id) : undefined,
        page_id: c.value.page_id != null ? String(c.value.page_id) : undefined,
      });
    }
  }
  return result;
}
