-- Booking Terms and Conditions -- a single admin-managed document shown on
-- the public /booking-terms page (linked from the footer only).
--
-- Singleton table: the boolean primary key + CHECK (id) pins it to exactly
-- one row, seeded below, so the app only ever UPDATEs it -- no insert or
-- delete policies are needed. Paragraphs are stored as plain text separated
-- by blank lines and split at render time.
--
-- RLS: unconditional public read (an empty document just renders a fallback
-- message), plus can_manage_packages-scoped authenticated UPDATE via the
-- existing has_permission() SECURITY DEFINER helper, matching faqs. Purely
-- additive -- does not modify has_permission() or any earlier table/policy.
create table booking_terms (
  id boolean primary key default true check (id),
  content text not null default '',
  updated_at timestamptz not null default now()
);

insert into booking_terms (id) values (true);

alter table booking_terms enable row level security;

create policy "public read" on booking_terms
  for select using (true);

create policy "manage_packages can update booking terms" on booking_terms
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));
