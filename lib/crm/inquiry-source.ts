/** Where an inquiry came from. Mirrors the inquiries.source check constraint. */
export type InquirySource = "website" | "meta_lead_ad";

export const INQUIRY_SOURCE_LABELS: Record<InquirySource, string> = {
  website: "Website",
  meta_lead_ad: "Meta Lead Ad",
};

export type MetaLeadSourceDetails = {
  formName: string | null;
  campaignName: string | null;
  adName: string | null;
};

/** inquiries.source_details (jsonb, written by record_meta_lead) for display. */
export function toMetaLeadSourceDetails(value: unknown): MetaLeadSourceDetails {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string) =>
    typeof obj[key] === "string" && obj[key] !== "" ? (obj[key] as string) : null;
  return {
    formName: text("form_name"),
    campaignName: text("campaign_name"),
    adName: text("ad_name"),
  };
}
