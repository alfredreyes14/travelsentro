import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { APIRequestContext } from "@playwright/test";

import { E2E_ENV, MOCK_URL } from "./env";

/** Service-role database client: tests arrange and check data with it. */
export function db() {
  return createClient(E2E_ENV.NEXT_PUBLIC_SUPABASE_URL, E2E_ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export const ADMIN = { email: "e2e-admin@example.com", password: "e2e-Password-123!" };
export const PAGE_ID = "446521218543410";
const MOCK = MOCK_URL;
const DAY = 24 * 60 * 60 * 1000;

export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const daysAgo = (days: number) => ago(days * DAY);
export const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

// ------------------------------------------------ fake outside services

export async function resetMock() {
  await fetch(`${MOCK}/__reset`, { method: "POST" });
}

export type MockRequest = { method: string; path: string; body: unknown };

export async function mockRequests(): Promise<MockRequest[]> {
  return (await fetch(`${MOCK}/__requests`)).json();
}

/** Emails the app sent through the fake Resend (batch sends, flattened). */
export async function sentEmails(): Promise<{ to: string; subject: string; html: string }[]> {
  const out: { to: string; subject: string; html: string }[] = [];
  for (const r of await mockRequests()) {
    if (r.path.startsWith("/resend/emails/batch") && Array.isArray(r.body)) {
      for (const e of r.body as { to: string | string[]; subject: string; html: string }[]) {
        out.push({ to: String(Array.isArray(e.to) ? e.to[0] : e.to), subject: e.subject, html: e.html });
      }
    }
  }
  return out;
}

type FakeMessage = {
  from: "customer" | "page";
  text?: string;
  image?: boolean;
  minutesAgo: number;
};

/** One Messenger chat as the Conversations API returns it. */
export function chat(psid: string, name: string, messages: FakeMessage[]) {
  const sorted = [...messages].sort((a, b) => a.minutesAgo - b.minutesAgo); // newest first
  return {
    id: `t_${psid}`,
    link: `/${PAGE_ID}/inbox/${psid}/?section=messages`,
    updated_time: ago((sorted[0]?.minutesAgo ?? 0) * 60_000),
    participants: { data: [{ id: psid, name }, { id: PAGE_ID, name: "TravelSentro" }] },
    messages: {
      data: sorted.map((m, i) => ({
        id: `m_${psid}_${i}`,
        message: m.text ?? "",
        created_time: ago(m.minutesAgo * 60_000),
        from: { id: m.from === "page" ? PAGE_ID : psid },
        ...(m.image ? { attachments: { data: [{ mime_type: "image/jpeg" }] } } : {}),
      })),
    },
  };
}

export async function setConversations(conversations: unknown[]) {
  await fetch(`${MOCK}/__conversations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(conversations),
  });
}

/** Makes the next Messenger check read chats from the last `minutes`. */
export async function rewindMessengerSync(minutes = 120) {
  const { error } = await db()
    .from("messenger_sync_state")
    .update({ last_synced_at: ago(minutes * 60_000) })
    .eq("id", true);
  if (error) throw error;
}

// ------------------------------------------------ crons

export async function runCron(request: APIRequestContext, path: string) {
  const res = await request.get(path, {
    headers: { authorization: `Bearer ${E2E_ENV.CRON_SECRET}` },
  });
  return { status: res.status(), body: await res.json() };
}

// ------------------------------------------------ test data

type LeadOptions = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  stage?: string;
  clientType?: "b2c" | "b2b";
  /** When the lead came in / entered its stage. */
  daysOld?: number;
  stageDaysAgo?: number;
  inquiry?: boolean;
  messengerPsid?: string | null;
};

export async function seedLead(options: LeadOptions = {}) {
  const name = options.name ?? unique("E2E Lead");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
  const createdAt = daysAgo(options.daysOld ?? 2);
  const { data, error } = await db()
    .from("contacts")
    .insert({
      name,
      email: options.email === undefined ? `${slug}@example.com` : options.email,
      phone: options.phone ?? null,
      client_type: options.clientType ?? "b2c",
      stage: options.stage ?? "new",
      messenger_psid: options.messengerPsid ?? null,
      created_at: createdAt,
      stage_changed_at: daysAgo(options.stageDaysAgo ?? options.daysOld ?? 2),
    })
    .select("id, name, email")
    .single();
  if (error) throw error;

  if (options.inquiry !== false) {
    const { error: inquiryError } = await db().from("inquiries").insert({
      contact_id: data.id,
      request_id: randomUUID(),
      message: "E2E inquiry",
      created_at: createdAt,
    });
    if (inquiryError) throw inquiryError;
  }
  return data as { id: string; name: string; email: string | null };
}

export async function contact(id: string) {
  const { data, error } = await db().from("contacts").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}
