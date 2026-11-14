-- Meta lead sync log.
--
-- One row per run of the Meta lead ads -> CRM sync, whether started by the
-- nightly Vercel Cron or the CRM's "Sync Meta leads" button. The row is
-- inserted as 'running' when the run starts and updated when it ends, so a
-- run that Vercel kills at its time limit stays 'running' and the admin UI
-- shows it as timed out.
--
-- Written only with the service-role key (lib/meta-leads/run-sync.ts), so
-- there is no INSERT/UPDATE/DELETE policy. Every signed-in staff member can
-- read it, like contacts.
--
-- Additive only.

create table meta_lead_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual')),
  -- Snapshot of who pressed the button (null for cron). Not a join on
  -- profiles: staff can only read their own profiles row.
  triggered_by uuid references auth.users (id) on delete set null,
  triggered_by_name text,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  lookback_days integer,
  forms integer,
  -- Leads returned by Meta in the lookback window.
  pulled integer not null default 0,
  -- pulled = added + existing + no_contact + failed
  added integer not null default 0,
  existing integer not null default 0,
  no_contact integer not null default 0,
  failed integer not null default 0,
  -- Plain-language explanation shown to staff.
  error text,
  -- Raw error (Graph API body, database message) for debugging.
  error_detail text,
  -- Per-lead save failures: [{ leadgen_id, form_name, error }]
  lead_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lead_errors) = 'array')
);

create index meta_lead_sync_runs_started_at_idx
  on meta_lead_sync_runs (started_at desc);

alter table meta_lead_sync_runs enable row level security;

create policy "authenticated staff can read meta lead sync runs"
  on meta_lead_sync_runs
  for select to authenticated using (true);
