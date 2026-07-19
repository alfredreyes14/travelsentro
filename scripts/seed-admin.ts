/**
 * Idempotent bootstrap script for TravelSentro's very first Admin account.
 *
 * There is no sign-up route for the admin panel (Phase 2, D-01) -- this
 * repo-committed, env-var-driven script is the only way to get an initial
 * Admin credential. Safe to re-run: if a role='admin' profile already
 * exists, it no-ops (D-04); if the ADMIN_EMAIL auth user already exists but
 * isn't yet promoted, it promotes that existing profile instead of failing.
 *
 * Run via `npm run seed:admin` (-> `tsx --env-file=.env.local scripts/seed-admin.ts`).
 * Requires ADMIN_EMAIL / ADMIN_PASSWORD in the environment (see
 * .env.local.example) -- D-03: use a placeholder credential during
 * development, swap to the real business owner email right before launch.
 *
 * SECURITY: this script uses the Supabase service-role key, which bypasses
 * Row Level Security. It must only ever run from a CLI/dev-tooling context
 * (never imported from app/ or components/, never bundled into the app).
 */
import { createClient } from '@supabase/supabase-js'
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. ' +
      'Ensure .env.local is populated and run via `npm run seed:admin`.'
  )
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    'Missing ADMIN_EMAIL or ADMIN_PASSWORD in the environment. ' +
      'Set both in .env.local (see .env.local.example) before running `npm run seed:admin`.'
  )
}

async function seedAdmin() {
  await ensureWebSocketPolyfill()

  const supabase = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  })

  // D-04: if any role='admin' profile already exists, no-op rather than
  // creating a duplicate admin account.
  const { data: existingAdmin, error: existingAdminError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existingAdminError) {
    throw new Error(`Failed to check for existing admin profile: ${existingAdminError.message}`)
  }

  if (existingAdmin) {
    console.log(`Admin account already exists (${existingAdmin.email}, id=${existingAdmin.id}) -- no-op.`)
    return
  }

  // No admin profile yet -- create (or find) the auth user for ADMIN_EMAIL.
  let userId: string

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL as string,
    password: ADMIN_PASSWORD as string,
    email_confirm: true,
  })

  if (createError) {
    // The auth user may already exist under this email from a prior partial
    // run (e.g. a non-admin profile left behind) -- fall back to locating it
    // instead of failing outright, so the script stays safe to re-run.
    const alreadyExists = /already.*registered|already.*exists/i.test(createError.message)
    if (!alreadyExists) {
      throw new Error(`Failed to create admin auth user: ${createError.message}`)
    }

    console.log(`Auth user for ${ADMIN_EMAIL} already exists -- locating it instead of creating.`)

    let foundUserId: string | undefined
    let page = 1
    const perPage = 200
    while (!foundUserId) {
      const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page, perPage })
      if (listError) {
        throw new Error(`Failed to list auth users while locating ${ADMIN_EMAIL}: ${listError.message}`)
      }

      const match = listed.users.find((u) => u.email?.toLowerCase() === (ADMIN_EMAIL as string).toLowerCase())
      if (match) {
        foundUserId = match.id
        break
      }

      if (listed.users.length < perPage) break
      page += 1
    }

    if (!foundUserId) {
      throw new Error(`Could not find an existing auth user matching ${ADMIN_EMAIL}.`)
    }

    userId = foundUserId
  } else {
    if (!created.user) {
      throw new Error('auth.admin.createUser succeeded but returned no user.')
    }
    userId = created.user.id
  }

  // The on_auth_user_created trigger (02-01 Task 1) already auto-created a
  // Staff/no-permissions profiles row for this user -- promote it to Admin.
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      role: 'admin',
      is_active: true,
      can_manage_packages: true,
      can_message_customers: true,
      can_edit_crm: true,
      name: 'Admin',
    })
    .eq('id', userId)

  if (updateError) {
    throw new Error(`Failed to promote profile ${userId} to admin: ${updateError.message}`)
  }

  console.log(`Admin account ready: ${ADMIN_EMAIL} (id=${userId}).`)
}

seedAdmin().catch((err) => {
  console.error('seed-admin failed:', err)
  process.exit(1)
})
