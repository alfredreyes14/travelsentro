/**
 * Idempotent seed script for placeholder PH travel packages.
 *
 * Populates the live Supabase project (schema created in 01-02) with 3
 * placeholder packages, each with real Storage-hosted photos, a day-by-day
 * itinerary, inclusions/exclusions/bring-items, and a single faq_facts row.
 *
 * Run via `npm run seed` (-> `tsx --env-file=.env.local scripts/seed.ts`).
 *
 * Re-runnable: package rows are upserted on `slug` (unique constraint), and
 * all child rows for that package are deleted and reinserted on every run,
 * so re-running never duplicates data.
 *
 * SECURITY: this script uses the Supabase service-role key, which bypasses
 * Row Level Security. It must only ever run from a CLI/dev-tooling context
 * (never imported from app/ or components/, never bundled into the app).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from '../types/database'

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this script
 * never uses realtime features. Polyfill from `undici` (already present via
 * Next.js's dependency tree) rather than adding a new dependency.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === 'undefined') {
    const { WebSocket } = await import('undici')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).WebSocket = WebSocket
  }
}

// Prefer the server-only SUPABASE_URL; fall back to NEXT_PUBLIC_SUPABASE_URL
// since both point at the same project and only the key differs in privilege.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. ' +
      'Ensure .env.local is populated and run via `npm run seed`.'
  )
}

// Created in main(), after the WebSocket polyfill is installed (see
// ensureWebSocketPolyfill below) — @supabase/supabase-js constructs a
// RealtimeClient as soon as createClient() runs, which requires a global
// WebSocket constructor to exist even though this script never uses realtime.
let supabase: ReturnType<typeof createClient<Database>>

const SEED_ASSETS_DIR = join(process.cwd(), 'supabase', 'seed-assets')

type SeedInclusion = { kind: 'included' | 'excluded' | 'bring'; label: string; sortOrder: number }
type SeedItineraryDay = { dayNumber: number; title: string; description: string }
type SeedPhoto = { file: string; altText: string; displayOrder: number }

type SeedPackage = {
  slug: string
  name: string
  fromPrice: number
  durationDays: number
  durationLabel: string
  isPublished: true
  isFeatured: boolean
  sortOrder: number
  photos: SeedPhoto[]
  itinerary: SeedItineraryDay[]
  inclusions: SeedInclusion[]
  faq: { bestTimeToGo: string; groupSize: string }
}

const SEED_PACKAGES: SeedPackage[] = [
  {
    slug: 'palawan-island-hopping',
    name: 'Palawan Island Hopping',
    fromPrice: 8500,
    durationDays: 3,
    durationLabel: '3 days, 2 nights',
    isPublished: true,
    isFeatured: true,
    sortOrder: 0,
    photos: [
      { file: 'palawan-1.jpg', altText: 'Limestone cliffs and turquoise lagoon in Palawan', displayOrder: 0 },
      { file: 'palawan-2.jpg', altText: 'Banca boat anchored off a white sand island near El Nido', displayOrder: 1 },
    ],
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival & El Nido Town',
        description:
          'Arrive in El Nido, check in to your hotel, and spend the afternoon exploring the town proper and Las Cabanas Beach at sunset.',
      },
      {
        dayNumber: 2,
        title: 'Island Hopping Tour A',
        description:
          'Full-day banca boat tour of the Bacuit Archipelago, including the Big Lagoon, Small Lagoon, Secret Lagoon, and Shimizu Island. Lunch served on a nearby beach.',
      },
      {
        dayNumber: 3,
        title: 'Island Hopping Tour C & Departure',
        description:
          'Morning tour of Hidden Beach, Matinloc Shrine, and Secret Beach, followed by transfer back to town for departure.',
      },
    ],
    inclusions: [
      { kind: 'included', label: 'Hotel accommodation (2 nights)', sortOrder: 0 },
      { kind: 'included', label: 'Daily breakfast', sortOrder: 1 },
      { kind: 'included', label: 'Island hopping tours A & C with lunch', sortOrder: 2 },
      { kind: 'included', label: 'Environmental fees', sortOrder: 3 },
      { kind: 'excluded', label: 'Airfare to/from Palawan', sortOrder: 0 },
      { kind: 'excluded', label: 'Personal expenses and travel insurance', sortOrder: 1 },
      { kind: 'bring', label: 'Reef-safe sunscreen', sortOrder: 0 },
      { kind: 'bring', label: 'Waterproof bag or dry sack', sortOrder: 1 },
      { kind: 'bring', label: 'Swimwear and quick-dry clothing', sortOrder: 2 },
    ],
    faq: { bestTimeToGo: 'November to May (dry season)', groupSize: '2-15 travelers per group' },
  },
  {
    slug: 'siargao-surf-island',
    name: 'Siargao Surf & Island',
    fromPrice: 7200,
    durationDays: 4,
    durationLabel: '4 days, 3 nights',
    isPublished: true,
    isFeatured: false,
    sortOrder: 1,
    photos: [
      { file: 'siargao-1.jpg', altText: 'Surfer paddling out at Cloud 9, Siargao', displayOrder: 0 },
      { file: 'siargao-2.jpg', altText: 'Palm-lined coastline of Siargao Island', displayOrder: 1 },
    ],
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival & General Luna',
        description: 'Arrive at Sayak Airport, transfer to General Luna, and relax at your resort near Cloud 9.',
      },
      {
        dayNumber: 2,
        title: 'Surf Lesson at Cloud 9',
        description:
          'Beginner-friendly surf lesson with a local instructor at the famous Cloud 9 break, followed by free time in town.',
      },
      {
        dayNumber: 3,
        title: 'Island Hopping: Naked, Daku & Guyam',
        description:
          'Boat tour to three neighboring islands for swimming, beach picnics, and photos, with fresh seafood lunch on Daku Island.',
      },
      {
        dayNumber: 4,
        title: 'Sugba Lagoon & Departure',
        description:
          'Morning trip to Sugba Lagoon for kayaking and cliff jumping, then transfer back to the airport for departure.',
      },
    ],
    inclusions: [
      { kind: 'included', label: 'Resort accommodation (3 nights)', sortOrder: 0 },
      { kind: 'included', label: 'Daily breakfast', sortOrder: 1 },
      { kind: 'included', label: 'Beginner surf lesson & board rental', sortOrder: 2 },
      { kind: 'included', label: 'Island hopping & Sugba Lagoon tour', sortOrder: 3 },
      { kind: 'excluded', label: 'Airfare to/from Siargao', sortOrder: 0 },
      { kind: 'excluded', label: 'Alcoholic beverages', sortOrder: 1 },
      { kind: 'bring', label: 'Rash guard or swimwear', sortOrder: 0 },
      { kind: 'bring', label: 'Reef-safe sunscreen', sortOrder: 1 },
      { kind: 'bring', label: 'Cash for incidentals (limited ATMs)', sortOrder: 2 },
    ],
    faq: { bestTimeToGo: 'March to October (surf season)', groupSize: '2-10 travelers per group' },
  },
  {
    slug: 'banaue-rice-terraces',
    name: 'Banaue Rice Terraces',
    fromPrice: 6300,
    durationDays: 3,
    durationLabel: '3 days, 2 nights',
    isPublished: true,
    isFeatured: false,
    sortOrder: 2,
    photos: [
      { file: 'banaue-1.jpg', altText: 'Terraced rice paddies carved into the mountains of Banaue', displayOrder: 0 },
      { file: 'banaue-2.jpg', altText: 'Misty mountain view over the Banaue Rice Terraces', displayOrder: 1 },
    ],
    itinerary: [
      {
        dayNumber: 1,
        title: 'Arrival & Banaue Viewpoint',
        description:
          'Overnight bus arrival in Banaue, breakfast, then a visit to the Banaue Viewpoint for panoramic terrace views.',
      },
      {
        dayNumber: 2,
        title: 'Batad Rice Terraces Trek',
        description:
          'Full-day guided trek to the amphitheater-shaped Batad Rice Terraces, including a stop at Tappiya Waterfall.',
      },
      {
        dayNumber: 3,
        title: 'Local Village & Departure',
        description:
          'Morning visit to a nearby Ifugao village to learn about local weaving and woodcarving traditions, then transfer for departure.',
      },
    ],
    inclusions: [
      { kind: 'included', label: 'Lodge accommodation (2 nights)', sortOrder: 0 },
      { kind: 'included', label: 'Daily breakfast', sortOrder: 1 },
      { kind: 'included', label: 'Guided Batad trek with local guide', sortOrder: 2 },
      { kind: 'included', label: 'Village cultural tour', sortOrder: 3 },
      { kind: 'excluded', label: 'Transport to/from Banaue', sortOrder: 0 },
      { kind: 'excluded', label: 'Lunches and dinners', sortOrder: 1 },
      { kind: 'bring', label: 'Sturdy hiking shoes', sortOrder: 0 },
      { kind: 'bring', label: 'Light jacket (cool mountain evenings)', sortOrder: 1 },
      { kind: 'bring', label: 'Cash (limited card acceptance)', sortOrder: 2 },
    ],
    faq: { bestTimeToGo: 'November to May (dry season, clearer trails)', groupSize: '2-12 travelers per group' },
  },
]

async function seedPackage(pkg: SeedPackage) {
  console.log(`Seeding "${pkg.name}" (${pkg.slug})...`)

  const { data: pkgRow, error: pkgError } = await supabase
    .from('packages')
    .upsert(
      {
        slug: pkg.slug,
        name: pkg.name,
        from_price: pkg.fromPrice,
        duration_days: pkg.durationDays,
        duration_label: pkg.durationLabel,
        is_published: pkg.isPublished,
        is_featured: pkg.isFeatured,
        sort_order: pkg.sortOrder,
      },
      { onConflict: 'slug' }
    )
    .select()
    .single()

  if (pkgError || !pkgRow) {
    throw new Error(`Failed to upsert package ${pkg.slug}: ${pkgError?.message}`)
  }

  const packageId = pkgRow.id

  // Delete existing child rows for this package so re-runs never duplicate data.
  const [delPhotos, delItinerary, delInclusions, delFaq] = await Promise.all([
    supabase.from('package_photos').delete().eq('package_id', packageId),
    supabase.from('itinerary_days').delete().eq('package_id', packageId),
    supabase.from('package_inclusions').delete().eq('package_id', packageId),
    supabase.from('faq_facts').delete().eq('package_id', packageId),
  ])
  for (const [label, res] of [
    ['package_photos', delPhotos],
    ['itinerary_days', delItinerary],
    ['package_inclusions', delInclusions],
    ['faq_facts', delFaq],
  ] as const) {
    if (res.error) throw new Error(`Failed to clear existing ${label} for ${pkg.slug}: ${res.error.message}`)
  }

  // Upload photos to Storage, then insert package_photos rows.
  for (const photo of pkg.photos) {
    const fileBuffer = readFileSync(join(SEED_ASSETS_DIR, photo.file))
    const storagePath = `${packageId}/photo-${photo.displayOrder + 1}.jpg`

    const { error: uploadError } = await supabase.storage.from('package-photos').upload(storagePath, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

    if (uploadError) {
      throw new Error(`Failed to upload photo ${photo.file} for ${pkg.slug}: ${uploadError.message}`)
    }

    const { error: photoRowError } = await supabase.from('package_photos').insert({
      package_id: packageId,
      storage_path: storagePath,
      display_order: photo.displayOrder,
      alt_text: photo.altText,
    })

    if (photoRowError) {
      throw new Error(`Failed to insert package_photos row for ${pkg.slug}: ${photoRowError.message}`)
    }
  }

  // Itinerary days.
  const { error: itineraryError } = await supabase.from('itinerary_days').insert(
    pkg.itinerary.map((day) => ({
      package_id: packageId,
      day_number: day.dayNumber,
      title: day.title,
      description: day.description,
    }))
  )
  if (itineraryError) {
    throw new Error(`Failed to insert itinerary_days for ${pkg.slug}: ${itineraryError.message}`)
  }

  // Inclusions / exclusions / bring items.
  const { error: inclusionsError } = await supabase.from('package_inclusions').insert(
    pkg.inclusions.map((item) => ({
      package_id: packageId,
      kind: item.kind,
      label: item.label,
      sort_order: item.sortOrder,
    }))
  )
  if (inclusionsError) {
    throw new Error(`Failed to insert package_inclusions for ${pkg.slug}: ${inclusionsError.message}`)
  }

  // FAQ facts (exactly one row per package).
  const { error: faqError } = await supabase.from('faq_facts').insert({
    package_id: packageId,
    best_time_to_go: pkg.faq.bestTimeToGo,
    group_size: pkg.faq.groupSize,
  })
  if (faqError) {
    throw new Error(`Failed to insert faq_facts for ${pkg.slug}: ${faqError.message}`)
  }

  console.log(`  -> done (package_id=${packageId})`)
}

async function seed() {
  await ensureWebSocketPolyfill()

  supabase = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  })

  console.log(`Seeding ${SEED_PACKAGES.length} placeholder packages...`)
  for (const pkg of SEED_PACKAGES) {
    await seedPackage(pkg)
  }
  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
