/**
 * The two groups the Partners admin module manages. Values match the
 * `partners.partner_type` check constraint in
 * supabase/migrations/20260727075208_create_homepage_content_schema.sql.
 */
export const PARTNER_TYPES = ["brand_partner", "corporate_client"] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

export function isPartnerType(value: unknown): value is PartnerType {
  return PARTNER_TYPES.includes(value as PartnerType);
}

export const PARTNER_TYPE_LABELS: Record<
  PartnerType,
  { singular: string; plural: string; placement: string }
> = {
  brand_partner: {
    singular: "Brand Partner",
    plural: "Brand Partners",
    placement: "under Brand Partners in the Partner Affiliations section",
  },
  corporate_client: {
    singular: "Corporate Client",
    plural: "Corporate Clients",
    placement: "in the Corporate Clients section",
  },
};
