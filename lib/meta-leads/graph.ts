/**
 * Thin fetch-based Graph API wrapper for lead ads (no official Node SDK,
 * same approach as lib/messenger/webhook.ts). No "server-only" import so
 * scripts/import-meta-leads.ts can share it -- but it reads a secret token,
 * so never import it from a client component.
 *
 * Leads are polled (app/api/cron/meta-leads), not pushed: the Meta app
 * stays in Development mode, where lead webhooks don't fire for real leads.
 */
import type { MetaLead } from "./lead";

const GRAPH_API_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// The minimum needed to save a lead (leads_retrieval).
const CORE_LEAD_FIELDS = "id,created_time,form_id,field_data";
// Ad / campaign fields need ads_management on top of leads_retrieval. If
// the token lacks it (or Meta rejects any of these), the request fails as a
// whole, so listFormLeads retries with the core fields rather than losing the lead.
const AD_LEAD_FIELDS = "ad_id,ad_name,adset_name,campaign_id,campaign_name,platform,is_organic";
const ALL_LEAD_FIELDS = `${CORE_LEAD_FIELDS},${AD_LEAD_FIELDS}`;

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

/**
 * A Page access token with leads_retrieval for `pageId`.
 *
 * Preferred: META_SYSTEM_USER_TOKEN, a never-expiring System User token
 * (Business settings -> System users) with the Page assigned. It is swapped
 * for the Page's own token on each run, which also never expires.
 *
 * Fallback: a Page token stored directly in META_LEADS_ACCESS_TOKEN or,
 * failing that, MESSENGER_PAGE_ACCESS_TOKEN.
 */
export async function getPageAccessToken(pageId: string): Promise<string> {
  const systemToken = process.env.META_SYSTEM_USER_TOKEN;
  if (systemToken) {
    const page = await graphGet<{ access_token?: string }>(
      withFields(encodeURIComponent(pageId), "access_token"),
      systemToken
    );
    if (!page.access_token) {
      throw new Error(
        `META_SYSTEM_USER_TOKEN has no access to page ${pageId}: assign the Page to the System User.`
      );
    }
    return page.access_token;
  }

  const pageToken =
    process.env.META_LEADS_ACCESS_TOKEN || process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    throw new Error(
      "Meta lead sync is not configured: set META_SYSTEM_USER_TOKEN (or META_LEADS_ACCESS_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN)."
    );
  }
  return pageToken;
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
