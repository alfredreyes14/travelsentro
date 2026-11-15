import { createHash } from "node:crypto";

import { metaStageName } from "./stages";

/**
 * Conversions API for CRM ("Conversion Leads"): one event per CRM stage a
 * Meta lead reaches, keyed by its leadgen id, so Meta can optimise ads for
 * leads that book. Format per Meta's payload specification: event_name is
 * the CRM stage, action_source "system_generated", custom_data marks the
 * event as coming from a CRM. Meta rejects events older than 7 days.
 */

export const CAPI_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const CRM_NAME = "TravelSentro CRM";

export type CapiStageEvent = {
  leadId: string;
  stage: string;
  /** Unix seconds. */
  eventTime: number;
  email?: string | null;
  phone?: string | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Philippine mobile -> 63XXXXXXXXXX (Meta wants country code, digits only). */
export function normalizePhoneForMeta(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return `63${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("63")) return digits;
  if (digits.length === 10 && digits.startsWith("9")) return `63${digits}`;
  return digits.length >= 8 ? digits : null;
}

export function isFreshEnough(eventTime: number, now = Date.now() / 1000): boolean {
  return now - eventTime <= CAPI_MAX_AGE_SECONDS;
}

const LEAD_ID = /^\d{6,20}$/;

/**
 * The request body. Lead ids are 15-17 digits, past what a JS number holds
 * exactly, so they're written into the JSON as raw digits rather than
 * through JSON.stringify of a number.
 */
export function buildCapiBody(events: CapiStageEvent[], testEventCode?: string): string {
  const data = events
    .filter((e) => LEAD_ID.test(e.leadId))
    .map((e) => {
      const userData: Record<string, unknown> = { lead_id: `__LEAD_${e.leadId}__` };
      const email = e.email?.trim().toLowerCase();
      if (email) userData.em = [sha256(email)];
      const phone = e.phone ? normalizePhoneForMeta(e.phone) : null;
      if (phone) userData.ph = [sha256(phone)];
      return {
        event_name: metaStageName(e.stage),
        event_time: Math.floor(e.eventTime),
        action_source: "system_generated",
        user_data: userData,
        custom_data: { event_source: "crm", lead_event_source: CRM_NAME },
      };
    });

  const body: Record<string, unknown> = { data };
  if (testEventCode) body.test_event_code = testEventCode;
  return JSON.stringify(body).replace(/"__LEAD_(\d+)__"/g, "$1");
}
