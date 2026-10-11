/**
 * One-off, re-runnable seed that moves the four logos the homepage used to
 * read from public/logos/brand-partners and "corporate partners" into the
 * admin-managed partners table: uploads each file to R2 and inserts its
 * row. Run once per environment, after 20261011120000_partners_module.sql
 * is applied there and before the homepage switches to reading the table.
 *
 * Run via `npm run seed:partners` (-> `tsx --env-file=.env.local
 * scripts/seed-partner-logos.ts`), with the Supabase and R2 variables
 * pointed at the environment being seeded.
 *
 * Re-runnable: an entry is skipped when a row already has its storage key,
 * or the same group and name -- so re-running never duplicates, including
 * after staff have renamed a seeded partner in the admin. Links are left
 * blank and names come from the filenames; staff set both in the admin.
 *
 * SECURITY: uses the Supabase service-role key, which bypasses Row Level
 * Security. CLI/dev-tooling only -- never import from app/ or components/.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../types/database";
import { uploadObject } from "../lib/storage/r2-client";
import type { PartnerType } from "../lib/partners/partner-type";

/**
 * Node 20 has no native global WebSocket; @supabase/supabase-js always
 * constructs a RealtimeClient, which requires one. Mirrors scripts/seed.ts.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run seed:partners`."
  );
}

const SEED_ASSETS_DIR = join(
  process.cwd(),
  "supabase",
  "seed-assets",
  "partner-logos"
);

type SeedPartner = {
  file: string;
  partnerType: PartnerType;
  name: string;
  contentType: string;
  storagePath: string;
};

const SEED_PARTNERS: ReadonlyArray<SeedPartner> = [
  {
    file: "brand-partners/dna.svg",
    partnerType: "brand_partner",
    name: "DNA",
    contentType: "image/svg+xml",
    storagePath: "partners/seed-brand-partner-dna.svg",
  },
  {
    file: "brand-partners/fl.svg",
    partnerType: "brand_partner",
    name: "FL",
    contentType: "image/svg+xml",
    storagePath: "partners/seed-brand-partner-fl.svg",
  },
  {
    file: "corporate-clients/sga.svg",
    partnerType: "corporate_client",
    name: "SGA",
    contentType: "image/svg+xml",
    storagePath: "partners/seed-corporate-client-sga.svg",
  },
  {
    file: "corporate-clients/paynamics.png",
    partnerType: "corporate_client",
    name: "Paynamics",
    contentType: "image/png",
    storagePath: "partners/seed-corporate-client-paynamics.png",
  },
];

type Client = ReturnType<typeof createClient<Database>>;

async function alreadySeeded(
  supabase: Client,
  partner: SeedPartner
): Promise<boolean> {
  const byPath = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("logo_storage_path", partner.storagePath);
  if (byPath.error) throw new Error(byPath.error.message);
  if ((byPath.count ?? 0) > 0) return true;

  const byName = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("partner_type", partner.partnerType)
    .eq("name", partner.name);
  if (byName.error) throw new Error(byName.error.message);
  return (byName.count ?? 0) > 0;
}

async function nextSortOrder(
  supabase: Client,
  partnerType: PartnerType
): Promise<number> {
  const { data, error } = await supabase
    .from("partners")
    .select("sort_order")
    .eq("partner_type", partnerType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.sort_order + 1 : 0;
}

async function seed() {
  await ensureWebSocketPolyfill();

  console.log(
    `Seeding partner logos into ${new URL(SUPABASE_URL!).host} ` +
      `(R2 bucket: ${process.env.R2_BUCKET_NAME ?? "<unset>"})...`
  );

  const supabase = createClient<Database>(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let created = 0;
  for (const partner of SEED_PARTNERS) {
    if (await alreadySeeded(supabase, partner)) {
      console.log(`  skip    ${partner.name} (already present)`);
      continue;
    }

    const body = readFileSync(join(SEED_ASSETS_DIR, partner.file));
    await uploadObject(partner.storagePath, body, partner.contentType);

    const { error } = await supabase.from("partners").insert({
      partner_type: partner.partnerType,
      name: partner.name,
      logo_storage_path: partner.storagePath,
      sort_order: await nextSortOrder(supabase, partner.partnerType),
    });
    if (error) {
      throw new Error(`insert failed for ${partner.name}: ${error.message}`);
    }

    created += 1;
    console.log(`  created ${partner.name} (${partner.partnerType})`);
  }

  console.log(
    `Seed complete: ${created} created, ${SEED_PARTNERS.length - created} skipped.`
  );
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
