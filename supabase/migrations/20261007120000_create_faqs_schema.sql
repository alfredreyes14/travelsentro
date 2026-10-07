-- FAQs -- admin-managed question/answer pairs shown on the public /faq page.
--
-- RLS mirrors destinations' shape (20260807120000_create_destinations_schema.sql):
-- public read is scoped to `is_published = true` in the policy itself, so a
-- draft FAQ is never readable by the anon client regardless of the app's
-- query-layer filter, plus can_manage_packages-scoped authenticated
-- SELECT/INSERT/UPDATE/DELETE via the existing has_permission() SECURITY
-- DEFINER helper. Purely additive -- does not modify has_permission() or any
-- earlier table/policy.
create table faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table faqs enable row level security;

create policy "public read" on faqs
  for select using (is_published = true);

create policy "manage_packages can read all faqs" on faqs
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert faqs" on faqs
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update faqs" on faqs
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete faqs" on faqs
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
