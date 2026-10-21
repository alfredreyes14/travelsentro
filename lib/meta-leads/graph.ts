/**
 * Thin fetch-based Graph API wrapper for lead ads (no official Node SDK,
 * same approach as lib/messenger/webhook.ts). No "server-only" import so
 * scripts/import-meta-leads.ts can share it -- but it reads a secret token,
 * so never import it from a client component.
 */
import type { MetaLead } from "./lead";

const GRAPH_API_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// The minimum needed to save a lead (leads_retrieval).
const CORE_LEAD_FIELDS = "id,created_time,form_id,field_data";
// Ad / campaign fields need ads_management on top of leads_retrieval. If
// the token lacks it (or Meta rejects any of these), the request fails as a
// whole, so fetchLead retries with the core fields rather than losing the lead.
const AD_LEAD_FIELDS = "ad_id,ad_name,adset_name,campaign_id,campaign_name,platform,is_organic";
const ALL_LEAD_FIELDS = `${CORE_LEAD_FIELDS},${AD_LEAD_FIELDS}`;

/**
 * A Page access token with leads_retrieval. META_LEADS_ACCESS_TOKEN wins
 * when set; otherwise the Messenger Page token is reused, which works once
 * it has been regenerated with the lead permissions.
 */
export function getLeadsAccessToken(): string {
  const token =
    process.env.META_LEADS_ACCESS_TOKEN || process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Meta lead sync is not configured: set META_LEADS_ACCESS_TOKEN (or MESSENGER_PAGE_ACCESS_TOKEN)."
    );
  }
  return token;
}

export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Graph API error ${status}: ${body}`);
  }
}

async function graphGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GraphApiError(res.status, await res.text());
  }
  return (await res.json()) as T;
}

function withFields(path: string, fields: string, extra = ""): string {
  return `${GRAPH}/${path}?fields=${encodeURIComponent(fields)}${extra}`;
}

export async function fetchLead(leadgenId: string, token: string): Promise<MetaLead> {
  const id = encodeURIComponent(leadgenId);
  try {
    return await graphGet<MetaLead>(withFields(id, ALL_LEAD_FIELDS), token);
  } catch (err) {
    if (err instanceof GraphApiError && err.status >= 400 && err.status < 500) {
      return graphGet<MetaLead>(withFields(id, CORE_LEAD_FIELDS), token);
    }
    throw err;
  }
}

/** Best-effort: a missing form name never blocks saving the lead. */
export async function fetchFormName(formId: string, token: string): Promise<string | null> {
  try {
    const form = await graphGet<{ name?: string }>(
      withFields(encodeURIComponent(formId), "name"),
      token
    );
    return form.name ?? null;
  } catch (err) {
    console.error("Meta lead form name lookup failed", err);
    return null;
  }
}

type Page<T> = { data: T[]; paging?: { next?: string } };

async function collectPages<T>(firstUrl: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const page: Page<T> = await graphGet<Page<T>>(url, token);
    items.push(...page.data);
    url = page.paging?.next;
  }
  return items;
}

export type MetaLeadForm = { id: string; name?: string; status?: string };

export function listLeadForms(pageId: string, token: string): Promise<MetaLeadForm[]> {
  return collectPages<MetaLeadForm>(
    withFields(`${encodeURIComponent(pageId)}/leadgen_forms`, "id,name,status", "&limit=100"),
    token
  );
}

/** Every lead on a form, optionally only those created at or after `since`. */
export async function listFormLeads(
  formId: string,
  token: string,
  since?: Date
): Promise<MetaLead[]> {
  const filter = since
    ? `&filtering=${encodeURIComponent(
        JSON.stringify([
          { field: "time_created", operator: "GREATER_THAN_OR_EQUAL", value: Math.floor(since.getTime() / 1000) },
        ])
      )}`
    : "";
  const path = `${encodeURIComponent(formId)}/leads`;
  try {
    return await collectPages<MetaLead>(withFields(path, ALL_LEAD_FIELDS, `&limit=100${filter}`), token);
  } catch (err) {
    if (err instanceof GraphApiError && err.status >= 400 && err.status < 500) {
      return collectPages<MetaLead>(withFields(path, CORE_LEAD_FIELDS, `&limit=100${filter}`), token);
    }
    throw err;
  }
}
