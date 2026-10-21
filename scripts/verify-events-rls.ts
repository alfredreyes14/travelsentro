/**
 * Proves the events and event_photos tables behave as the Events feature
 * needs, against a real database: anonymous visitors read published events
 * (and their photos) only and cannot write, and the database itself
 * rejects a published event without a cover, an end date before the start
 * date, a non-web link, an unknown type, blank text, and a duplicate slug.
 * Mirrors scripts/verify-partners-rls.ts's CheckResult/PASS-FAIL structure.
 *
 * Run via `npm run verify:events-rls` with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY pointed at
 * the local Supabase stack with 20261021120000_create_events_schema.sql
 * applied. It inserts and then deletes its own rows, all named with a
 * unique prefix.
 *
 * One fixture event is published, so for a moment it is publicly readable.
 * `.env.local` points at a hosted project by default, so the script
 * refuses any host other than the local stack unless `--allow-remote` is
 * passed.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. " +
      "Point these at a project with the events migration applied, then run " +
      "`npm run verify:events-rls`."
  );
}

/**
 * Node 20 has no native global WebSocket; @supabase/supabase-js always
 * constructs a RealtimeClient, which requires one.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

const PREFIX = `__verify_events_${Date.now()}`;
const VISIBLE_SLUG = `${PREFIX}-visible`;
const HIDDEN_SLUG = `${PREFIX}-hidden`;

function eventRow(overrides: Partial<EventInsert> & { slug: string }): EventInsert {
  return {
    name: `${PREFIX} event`,
    event_type: "booth",
    start_date: "2026-11-12",
    venue: "SMX Convention Center",
    ...overrides,
  };
}

async function expectInsertRejected(
  service: Client,
  name: string,
  row: EventInsert
): Promise<CheckResult> {
  const { error } = await service.from("events").insert(row);
  return {
    name,
    pass: error !== null,
    detail: error ? `rejected: code=${error.code} ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function main() {
  const { host, hostname } = new URL(SUPABASE_URL!);
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost";
  if (!isLocal && !process.argv.includes("--allow-remote")) {
    throw new Error(
      `Refusing to run against ${host}: this script writes a publicly readable row. ` +
        "Point NEXT_PUBLIC_SUPABASE_URL and the two keys at the local Supabase stack, " +
        "or pass --allow-remote if you really mean to use a hosted project."
    );
  }

  await ensureWebSocketPolyfill();
  console.log(`\nverify-events-rls -> ${host}\n`);

  const options = { auth: { persistSession: false } };
  const anon = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, options);
  const service = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, options);

  const results: CheckResult[] = [];
  try {
    const { data: seeded, error: seedError } = await service
      .from("events")
      .insert([
        eventRow({
          slug: VISIBLE_SLUG,
          cover_storage_path: "events/verify-visible.jpg",
          is_published: true,
        }),
        eventRow({ slug: HIDDEN_SLUG, is_published: false }),
      ])
      .select("id, slug");
    if (seedError || !seeded) {
      throw new Error(`could not insert fixture events: ${seedError?.message}`);
    }
    const visibleId = seeded.find((e) => e.slug === VISIBLE_SLUG)!.id;
    const hiddenId = seeded.find((e) => e.slug === HIDDEN_SLUG)!.id;

    const { error: photoError } = await service.from("event_photos").insert([
      { event_id: visibleId, storage_path: `events/${visibleId}/photo-1.jpg` },
      { event_id: hiddenId, storage_path: `events/${hiddenId}/photo-1.jpg` },
    ]);
    if (photoError) throw new Error(`could not insert fixture photos: ${photoError.message}`);

    {
      const { data, error } = await anon.from("events").select("slug").like("slug", `${PREFIX}%`);
      const slugs = (data ?? []).map((r) => r.slug);
      results.push({
        name: "anon reads published events only",
        pass: !error && slugs.length === 1 && slugs[0] === VISIBLE_SLUG,
        detail: error ? `error: ${error.message}` : `rows=${JSON.stringify(slugs)}`,
      });
    }

    {
      const { data, error } = await anon
        .from("event_photos")
        .select("event_id")
        .in("event_id", [visibleId, hiddenId]);
      const ids = (data ?? []).map((r) => r.event_id);
      results.push({
        name: "anon reads photos of published events only",
        pass: !error && ids.length === 1 && ids[0] === visibleId,
        detail: error ? `error: ${error.message}` : `rows=${ids.length}`,
      });
    }

    {
      const { error } = await anon.from("events").insert(eventRow({ slug: `${PREFIX}-anon` }));
      results.push({
        name: "anon cannot insert events",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
      });
    }

    {
      const { error } = await anon
        .from("event_photos")
        .insert({ event_id: visibleId, storage_path: "events/anon.jpg" });
      results.push({
        name: "anon cannot insert event photos",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
      });
    }

    results.push(
      await expectInsertRejected(
        service,
        "published without cover rejected",
        eventRow({ slug: `${PREFIX}-nocover`, is_published: true, cover_storage_path: null })
      )
    );

    {
      // A raw update can't publish the cover-less draft either.
      const { error } = await service
        .from("events")
        .update({ is_published: true })
        .eq("id", hiddenId);
      results.push({
        name: "publishing a cover-less draft by update rejected",
        pass: error !== null,
        detail: error ? `rejected: code=${error.code}` : "update unexpectedly succeeded",
      });
    }

    results.push(
      await expectInsertRejected(
        service,
        "end before start rejected",
        eventRow({ slug: `${PREFIX}-dates`, start_date: "2026-11-12", end_date: "2026-11-11" })
      )
    );
    results.push(
      await expectInsertRejected(
        service,
        "non-http link rejected",
        eventRow({ slug: `${PREFIX}-link`, link_url: "javascript:alert(1)" })
      )
    );
    results.push(
      await expectInsertRejected(
        service,
        "unknown event_type rejected",
        eventRow({ slug: `${PREFIX}-type`, event_type: "concert" })
      )
    );
    results.push(
      await expectInsertRejected(
        service,
        "blank name rejected",
        eventRow({ slug: `${PREFIX}-blankname`, name: "   " })
      )
    );
    results.push(
      await expectInsertRejected(
        service,
        "blank venue rejected",
        eventRow({ slug: `${PREFIX}-blankvenue`, venue: "   " })
      )
    );
    results.push(
      await expectInsertRejected(service, "duplicate slug rejected", eventRow({ slug: HIDDEN_SLUG }))
    );

    {
      await service.from("events").delete().eq("id", hiddenId);
      const { data, error } = await service
        .from("event_photos")
        .select("id")
        .eq("event_id", hiddenId);
      results.push({
        name: "deleting an event deletes its photos",
        pass: !error && (data ?? []).length === 0,
        detail: error ? `error: ${error.message}` : `remaining=${(data ?? []).length}`,
      });
    }
  } finally {
    // Photos cascade with their events.
    await service.from("events").delete().like("slug", `${PREFIX}%`);
  }

  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-events-rls failed:", err);
  process.exit(1);
});
