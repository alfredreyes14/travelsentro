/**
 * Proves the contacts B2C/B2B migration against a real database: the
 * stage/type, email-or-phone, contract-date and services constraints; the
 * removal of the old status column (20261023120000); that record_inquiry()
 * still creates a B2C / New contact; and the RLS on contacts inserts and
 * contact_documents. Mirrors scripts/verify-quote-rls.ts's structure.
 *
 * Run via `npm run verify:contacts-rls` with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY pointed at
 * the local Supabase stack with 20261013120000_contacts_b2c_b2b.sql
 * applied. It creates and deletes its own contacts and staff accounts.
 * `.env.local` points at the hosted project production uses, so the
 * script refuses any host other than the local stack.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. " +
      "Point them at the local stack, then run `npm run verify:contacts-rls`."
  );
}

/** Same Node 20 WebSocket polyfill as scripts/verify-upsell-rls.ts. */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;

const STAMP = Date.now();
const PREFIX = `__verify_contacts_${STAMP}`;
const emailFor = (label: string) => `verify-contacts-${label}-${STAMP}@example.com`;

async function signedInClient(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  const { host, hostname } = new URL(SUPABASE_URL as string);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Refusing to run against ${host}: this script writes contacts and staff accounts. ` +
        "Point NEXT_PUBLIC_SUPABASE_URL and the two keys at the local Supabase stack."
    );
  }

  await ensureWebSocketPolyfill();
  console.log(`\nverify-contacts-rls -> ${host}\n`);

  const options = { auth: { persistSession: false } };
  const anon = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, options);
  const service = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, options);

  const results: CheckResult[] = [];
  const userIds: string[] = [];
  const password = `Verify-${STAMP}-pw`;

  const rejected = (name: string, error: { code?: string; message: string } | null, code: string) => {
    results.push({
      name,
      pass: error?.code === code,
      detail: error ? `code=${error.code} ${error.message}` : "unexpectedly succeeded",
    });
  };

  const readContact = async (id: string) => {
    const { data, error } = await service
      .from("contacts")
      .select("stage, client_type")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error(`readContact failed: ${error?.message}`);
    return data;
  };

  try {
    // ------------------------------------------------ defaults and trigger
    const { data: base, error: baseError } = await service
      .from("contacts")
      .insert({ name: `${PREFIX} base`, email: emailFor("base") })
      .select("id, stage, client_type")
      .single();
    if (baseError || !base) throw new Error(`fixture insert failed: ${baseError?.message}`);

    results.push({
      name: "a new contact defaults to b2c / new",
      pass: base.client_type === "b2c" && base.stage === "new",
      detail: JSON.stringify(base),
    });

    // Would fail if the old status <-> stage trigger were still attached,
    // since its function reads the dropped column.
    await service.from("contacts").update({ stage: "quotation" }).eq("id", base.id);
    let row = await readContact(base.id);
    results.push({
      name: "setting a stage works with the status column gone",
      pass: row.stage === "quotation",
      detail: JSON.stringify(row),
    });

    await service.from("contacts").update({ client_type: "b2b", stage: "follow_up" }).eq("id", base.id);
    row = await readContact(base.id);
    results.push({
      name: "converting to b2b / follow_up",
      pass: row.client_type === "b2b" && row.stage === "follow_up",
      detail: JSON.stringify(row),
    });

    {
      const { error } = await service.from("contacts").select("status").limit(1);
      results.push({
        name: "contacts.status no longer exists",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "column still readable",
      });
    }

    // ---------------------------------------------------------- constraints
    {
      const { error } = await service
        .from("contacts")
        .insert({ name: `${PREFIX} wrong pipeline`, email: emailFor("wrong"), stage: "discovery" });
      rejected("a B2B stage on a B2C contact is rejected", error, "23514");
    }
    {
      const { error } = await service
        .from("contacts")
        .update({ stage: "inquiry" })
        .eq("id", base.id);
      rejected("a B2C stage on a B2B contact is rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({ name: `${PREFIX} unreachable` });
      rejected("a contact with neither email nor phone is rejected", error, "23514");
    }
    {
      const { error } = await service
        .from("contacts")
        .insert({ name: `${PREFIX} blank`, email: "  ", phone: "" });
      rejected("blank email and blank phone are rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({
        name: `${PREFIX} dates`,
        email: emailFor("dates"),
        contract_start: "2026-06-01",
        contract_end: "2026-05-31",
      });
      rejected("a contract ending before it starts is rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({
        name: `${PREFIX} service`,
        email: emailFor("service"),
        services_availed: ["cruise"],
      });
      rejected("an unknown service key is rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({
        name: `${PREFIX} other`,
        email: emailFor("other"),
        services_availed: ["tour_package"],
        services_other: "Insurance",
      });
      rejected("Other text without Other ticked is rejected", error, "23514");
    }
    {
      const { error } = await service
        .from("contacts")
        .insert({ name: `${PREFIX} duplicate`, email: emailFor("base") });
      rejected("a duplicate email is rejected", error, "23505");
    }
    {
      const { error } = await service.from("contacts").insert([
        { name: `${PREFIX} phone only 1`, phone: "09170000001" },
        { name: `${PREFIX} phone only 2`, phone: "09170000002" },
      ]);
      results.push({
        name: "two phone-only contacts are both accepted",
        pass: error === null,
        detail: error ? `code=${error.code} ${error.message}` : "inserted",
      });
    }

    // ------------------------------------------------------- record_inquiry
    {
      const { data, error } = await service.rpc("record_inquiry", {
        p_request_id: randomUUID(),
        p_email: emailFor("inquiry"),
        p_name: `${PREFIX} inquiry`,
        p_phone: "",
        p_message: "verify",
      });
      const contactId = data?.[0]?.contact_id;
      const created = contactId ? await readContact(contactId) : null;
      results.push({
        name: "record_inquiry() still creates a b2c / new contact",
        pass: !error && created?.client_type === "b2c" && created.stage === "new",
        detail: error ? error.message : JSON.stringify(created),
      });
    }

    // ---------------------------------------------------------------- tags
    await service.from("contacts").update({ tags: ["zeta", "Alpha"] }).eq("id", base.id);

    // ----------------------------------------------------------------- RLS
    const makeUser = async (label: string) => {
      const email = emailFor(`staff-${label}`);
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
      userIds.push(data.user.id);
      return { id: data.user.id, email };
    };

    const denied = await makeUser("denied");
    const allowed = await makeUser("allowed");
    const { error: grantError } = await service
      .from("profiles")
      .update({ can_edit_crm: true })
      .eq("id", allowed.id);
    if (grantError) throw new Error(`grant can_edit_crm failed: ${grantError.message}`);

    const deniedClient = await signedInClient(denied.email, password);
    const allowedClient = await signedInClient(allowed.email, password);

    const documentRow = (label: string) => ({
      contact_id: base.id,
      file_name: `${label}.pdf`,
      storage_key: `contacts/${base.id}/${randomUUID()}.pdf`,
      content_type: "application/pdf",
      size_bytes: 1024,
    });

    const { data: seededDoc, error: seedDocError } = await service
      .from("contact_documents")
      .insert(documentRow("seeded"))
      .select("id")
      .single();
    if (seedDocError || !seededDoc) throw new Error(`document fixture failed: ${seedDocError?.message}`);

    {
      const { data, error } = await anon.from("contact_documents").select("id").eq("contact_id", base.id);
      results.push({
        name: "an anonymous visitor reads no documents",
        pass: !error && (data ?? []).length === 0,
        detail: `rows=${data?.length ?? "n/a"} error=${error?.message ?? "none"}`,
      });
    }
    {
      const { data, error } = await deniedClient.from("contact_documents").select("id").eq("contact_id", base.id);
      results.push({
        name: "staff without can_edit_crm can read documents",
        pass: !error && (data ?? []).length === 1,
        detail: `rows=${data?.length ?? "n/a"} error=${error?.message ?? "none"}`,
      });
    }
    {
      const { error } = await deniedClient.from("contact_documents").insert(documentRow("denied"));
      results.push({
        name: "staff without can_edit_crm cannot add a document",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
      });
    }
    {
      const { data } = await deniedClient.from("contact_documents").delete().eq("id", seededDoc.id).select("id");
      results.push({
        name: "staff without can_edit_crm cannot delete a document",
        pass: (data ?? []).length === 0,
        detail: `deleted rows=${data?.length ?? 0}`,
      });
    }
    {
      const { error } = await deniedClient
        .from("contacts")
        .insert({ name: `${PREFIX} denied`, email: emailFor("denied-contact") });
      results.push({
        name: "staff without can_edit_crm cannot add a contact",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
      });
    }
    {
      const { data, error } = await allowedClient
        .from("contacts")
        .insert({ name: `${PREFIX} allowed`, phone: "09170000003", client_type: "b2b" })
        .select("id, client_type, stage")
        .single();
      results.push({
        name: "staff with can_edit_crm can add a phone-only B2B contact",
        pass: !error && data?.client_type === "b2b" && data.stage === "new",
        detail: error ? error.message : JSON.stringify(data),
      });
    }
    {
      const { data: inserted, error: insertError } = await allowedClient
        .from("contact_documents")
        .insert(documentRow("allowed"))
        .select("id, uploaded_by")
        .single();
      const { data: deleted } = inserted
        ? await allowedClient.from("contact_documents").delete().eq("id", inserted.id).select("id")
        : { data: null };
      results.push({
        name: "staff with can_edit_crm can add and delete a document, stamped as theirs",
        pass: !insertError && inserted?.uploaded_by === allowed.id && (deleted ?? []).length === 1,
        detail: insertError ? insertError.message : `uploaded_by=${inserted?.uploaded_by} deleted=${deleted?.length ?? 0}`,
      });
    }
    {
      const { data, error } = await deniedClient.rpc("list_contact_tags");
      const tags = data ?? [];
      results.push({
        name: "list_contact_tags() returns distinct tags in order",
        pass: !error && tags.indexOf("Alpha") !== -1 && tags.indexOf("Alpha") < tags.indexOf("zeta"),
        detail: error ? error.message : JSON.stringify(tags),
      });
    }
    {
      const { data, error } = await anon.rpc("list_contact_tags");
      results.push({
        name: "an anonymous visitor gets no tags",
        pass: error !== null || (data ?? []).length === 0,
        detail: error ? `rejected: ${error.message}` : `rows=${data?.length ?? 0}`,
      });
    }
  } finally {
    await service.from("contacts").delete().like("name", `${PREFIX}%`);
    for (const id of userIds) {
      await service.auth.admin.deleteUser(id);
    }
  }

  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-contacts-rls failed:", err);
  process.exit(1);
});
