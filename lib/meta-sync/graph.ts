import "server-only";

import { FACEBOOK_PAGE_ID } from "@/lib/constants";
import { getPageAccessToken } from "@/lib/meta-leads/graph";

/**
 * Graph API calls for the stage sync: Messenger inbox labels (Custom Labels
 * API, needs pages_messaging on the Page token) and Conversions API events.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export class MetaApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Meta API error ${status}: ${body.slice(0, 300)}`);
  }
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new MetaApiError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------------------------------------------------------------- labels

/** The Page token, or null when none is configured. */
export async function pageTokenOrNull(): Promise<string | null> {
  try {
    return await getPageAccessToken(FACEBOOK_PAGE_ID);
  } catch {
    return null;
  }
}

type Label = { id: string; page_label_name: string };

export async function listPageLabels(token: string): Promise<Label[]> {
  const labels: Label[] = [];
  let path: string | null = `${FACEBOOK_PAGE_ID}/custom_labels?fields=page_label_name&limit=100`;
  while (path) {
    const page: { data: Label[]; paging?: { next?: string } } = await call("GET", path, token);
    labels.push(...page.data);
    path = page.paging?.next ? page.paging.next.replace(`${GRAPH}/`, "") : null;
  }
  return labels;
}

export async function createPageLabel(token: string, name: string): Promise<string> {
  const created = await call<{ id: string }>("POST", `${FACEBOOK_PAGE_ID}/custom_labels`, token, {
    page_label_name: name,
  });
  return created.id;
}

export async function labelsOnChat(token: string, psid: string): Promise<Label[]> {
  const res = await call<{ data: Label[] }>(
    "GET",
    `${encodeURIComponent(psid)}/custom_labels?fields=page_label_name`,
    token
  );
  return res.data ?? [];
}

export function addLabelToChat(token: string, labelId: string, psid: string) {
  return call("POST", `${encodeURIComponent(labelId)}/label`, token, { user: psid });
}

export function removeLabelFromChat(token: string, labelId: string, psid: string) {
  return call(
    "DELETE",
    `${encodeURIComponent(labelId)}/label?user=${encodeURIComponent(psid)}`,
    token
  );
}

/** A Messenger user's display name, or null (needs pages_messaging). */
export async function messengerUserName(token: string, psid: string): Promise<string | null> {
  try {
    const res = await call<{ name?: string; first_name?: string; last_name?: string }>(
      "GET",
      `${encodeURIComponent(psid)}?fields=name`,
      token
    );
    return res.name ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Conversions API

export type CapiConfig = { datasetId: string; token: string; testEventCode?: string };

/** Conversions API for CRM settings, or null when not set up. */
export function capiConfig(): CapiConfig | null {
  const datasetId = process.env.META_CRM_DATASET_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
  if (!datasetId || !token) return null;
  return {
    datasetId,
    token,
    testEventCode: process.env.META_CAPI_TEST_EVENT_CODE || undefined,
  };
}

export async function sendCapiEvents(config: CapiConfig, body: string): Promise<void> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(config.datasetId)}/events?access_token=${encodeURIComponent(config.token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    }
  );
  if (!res.ok) throw new MetaApiError(res.status, await res.text());
}
