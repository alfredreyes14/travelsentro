/**
 * Idempotent seed script for placeholder PH travel packages.
 *
 * Populates the live Supabase project (schema created in 01-02) with 3
 * placeholder packages, each with real Storage-hosted photos, a day-by-day
 * itinerary, inclusions/exclusions/bring-items, and one or more travel dates.
 *
 * Run via `npm run seed` (-> `tsx --env-file=.env.local scripts/seed.ts`).
 *
 * Re-runnable: package rows are upserted on `name` (looked up and updated or
 * inserted -- `slug` is now DB-generated at insert time via a trigger, so it
 * can't be used as a stable idempotency key), and all child rows for that
 * package are deleted and reinserted on every run, so re-running never
 * duplicates data.
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
type SeedTravelDate = { date: string; additionalFee?: number }

type SeedPackage = {
  name: string
  pricePerPax: number
  discountAmount?: number
  durationLabel: string
  remarks?: string
  isPublished: true
  isFeatured: boolean
  sortOrder: number
  destinationSlug: string
  photos: SeedPhoto[]
  itinerary: SeedItineraryDay[]
  inclusions: SeedInclusion[]
  travelDates: SeedTravelDate[]
}

type SeedDestination = {
  slug: string
  name: string
  region: 'local' | 'international'
  sortOrder: number
}

const SEED_DESTINATIONS: SeedDestination[] = [
  { slug: 'palawan', name: 'Palawan', region: 'local', sortOrder: 0 },
  { slug: 'siargao', name: 'Siargao', region: 'local', sortOrder: 1 },
  { slug: 'banaue', name: 'Banaue', region: 'local', sortOrder: 2 },
  { slug: 'boracay', name: 'Boracay', region: 'local', sortOrder: 3 },
  { slug: 'cebu', name: 'Cebu', region: 'local', sortOrder: 4 },
  { slug: 'bohol', name: 'Bohol', region: 'local', sortOrder: 5 },
  { slug: 'baguio', name: 'Baguio', region: 'local', sortOrder: 6 },
  { slug: 'tagaytay', name: 'Tagaytay', region: 'local', sortOrder: 7 },
  { slug: 'japan', name: 'Japan', region: 'international', sortOrder: 0 },
  { slug: 'china', name: 'China', region: 'international', sortOrder: 1 },
  { slug: 'south-korea', name: 'South Korea', region: 'international', sortOrder: 2 },
  { slug: 'malaysia', name: 'Malaysia', region: 'international', sortOrder: 3 },
  { slug: 'thailand', name: 'Thailand', region: 'international', sortOrder: 4 },
  { slug: 'singapore', name: 'Singapore', region: 'international', sortOrder: 5 },
  { slug: 'taiwan', name: 'Taiwan', region: 'international', sortOrder: 6 },
  { slug: 'hong-kong', name: 'Hong Kong', region: 'international', sortOrder: 7 },
]

const SEED_PACKAGES: SeedPackage[] = [
  {
    name: 'Palawan Island Hopping',
    pricePerPax: 8500,
    durationLabel: '3 days, 2 nights',
    remarks: 'Boat schedules are weather-dependent and may shift by a day.',
    isPublished: true,
    isFeatured: true,
    sortOrder: 0,
    destinationSlug: 'palawan',
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
    travelDates: [
      { date: '2026-09-12' },
      { date: '2026-10-17', additionalFee: 1500 },
      { date: '2026-11-21' },
    ],
  },
  {
    name: 'Siargao Surf & Island',
    pricePerPax: 7200,
    durationLabel: '4 days, 3 nights',
    remarks: 'Surf lessons require a minimum of 2 participants.',
    isPublished: true,
    isFeatured: false,
    sortOrder: 1,
    destinationSlug: 'siargao',
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
    travelDates: [
      { date: '2026-09-05' },
      { date: '2026-10-03' },
    ],
  },
  {
    name: 'Banaue Rice Terraces',
    pricePerPax: 6300,
    durationLabel: '3 days, 2 nights',
    isPublished: true,
    isFeatured: false,
    sortOrder: 2,
    destinationSlug: 'banaue',
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
    travelDates: [
      { date: '2026-11-14' },
    ],
  },
]

async function seedDestinations(): Promise<Map<string, string>> {
  console.log(`Seeding ${SEED_DESTINATIONS.length} destinations...`)
  const idBySlug = new Map<string, string>()

  for (const destination of SEED_DESTINATIONS) {
    const { data, error } = await supabase
      .from('destinations')
      .upsert(
        {
          slug: destination.slug,
          name: destination.name,
          region: destination.region,
          sort_order: destination.sortOrder,
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`Failed to upsert destination ${destination.slug}: ${error?.message}`)
    }

    idBySlug.set(destination.slug, data.id)
  }

  console.log('  -> destinations done')
  return idBySlug
}

async function seedPackage(pkg: SeedPackage, destinationIdBySlug: Map<string, string>) {
  console.log(`Seeding "${pkg.name}"...`)

  // slug is DB-generated (TSP-000001-style, assigned once at insert time),
  // so it can't be used as an upsert key anymore -- look up any existing
  // row by name instead, and only insert when none exists.
  const { data: existing, error: findError } = await supabase
    .from('packages')
    .select('id')
    .eq('name', pkg.name)
    .maybeSingle()

  if (findError) {
    throw new Error(`Failed to look up existing package "${pkg.name}": ${findError.message}`)
  }

  const payload = {
    name: pkg.name,
    price_per_pax: pkg.pricePerPax,
    discount_amount: pkg.discountAmount ?? null,
    duration_label: pkg.durationLabel,
    remarks: pkg.remarks ?? null,
    is_published: pkg.isPublished,
    is_featured: pkg.isFeatured,
    sort_order: pkg.sortOrder,
    destination_id: destinationIdBySlug.get(pkg.destinationSlug) ?? null,
  }

  const { data: pkgRow, error: pkgError } = existing
    ? await supabase.from('packages').update(payload).eq('id', existing.id).select().single()
    : await supabase.from('packages').insert(payload).select().single()

  if (pkgError || !pkgRow) {
    throw new Error(`Failed to upsert package "${pkg.name}": ${pkgError?.message}`)
  }

  const packageId = pkgRow.id

  // Delete existing child rows for this package so re-runs never duplicate data.
  const [delPhotos, delItinerary, delInclusions, delTravelDates] = await Promise.all([
    supabase.from('package_photos').delete().eq('package_id', packageId),
    supabase.from('itinerary_days').delete().eq('package_id', packageId),
    supabase.from('package_inclusions').delete().eq('package_id', packageId),
    supabase.from('package_travel_dates').delete().eq('package_id', packageId),
  ])
  for (const [label, res] of [
    ['package_photos', delPhotos],
    ['itinerary_days', delItinerary],
    ['package_inclusions', delInclusions],
    ['package_travel_dates', delTravelDates],
  ] as const) {
    if (res.error) throw new Error(`Failed to clear existing ${label} for "${pkg.name}": ${res.error.message}`)
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
      throw new Error(`Failed to upload photo ${photo.file} for "${pkg.name}": ${uploadError.message}`)
    }

    const { error: photoRowError } = await supabase.from('package_photos').insert({
      package_id: packageId,
      storage_path: storagePath,
      display_order: photo.displayOrder,
      alt_text: photo.altText,
    })

    if (photoRowError) {
      throw new Error(`Failed to insert package_photos row for "${pkg.name}": ${photoRowError.message}`)
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
    throw new Error(`Failed to insert itinerary_days for "${pkg.name}": ${itineraryError.message}`)
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
    throw new Error(`Failed to insert package_inclusions for "${pkg.name}": ${inclusionsError.message}`)
  }

  // Travel dates (at least one per package).
  const { error: travelDatesError } = await supabase.from('package_travel_dates').insert(
    pkg.travelDates.map((date) => ({
      package_id: packageId,
      travel_date: date.date,
      additional_fee: date.additionalFee ?? null,
    }))
  )
  if (travelDatesError) {
    throw new Error(`Failed to insert package_travel_dates for "${pkg.name}": ${travelDatesError.message}`)
  }

  console.log(`  -> done (package_id=${packageId}, slug=${pkgRow.slug})`)
}

async function seed() {
  await ensureWebSocketPolyfill()

  supabase = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  })

  const destinationIdBySlug = await seedDestinations()

  console.log(`Seeding ${SEED_PACKAGES.length} placeholder packages...`)
  for (const pkg of SEED_PACKAGES) {
    await seedPackage(pkg, destinationIdBySlug)
  }
  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
