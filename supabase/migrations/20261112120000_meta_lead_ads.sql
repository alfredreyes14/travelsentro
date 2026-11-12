-- Meta lead ads -> CRM sync.
--
-- (1) inquiries gains source ('website' | 'meta_lead_ad'), external_id (the
--     Meta leadgen ID, unique, so a redelivered webhook or a re-run import
--     never duplicates a lead) and source_details (form / campaign / ad
--     names, for reporting).
-- (2) record_meta_lead() -- the single write path for Meta leads. Finds the
--     contact by email, then by phone, else creates one; tags it
--     "Meta Lead Ad"; appends the inquiry. Callable by service_role only:
--     the webhook and the import script authenticate to Meta first and
--     write with the service-role key, so unlike record_inquiry() there is
--     no reason for anon to reach it.
--
-- Additive only. Staging and production share this database, so this runs
-- while master's code is still live -- every new column has a default and
-- nothing master reads or writes changes.

-- ============================================================================
-- (1) inquiries columns
-- ============================================================================
alter table inquiries
  add column source text not null default 'website'
    check (source in ('website', 'meta_lead_ad')),
  add column external_id text unique,
  add column source_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_details) = 'object');

-- ============================================================================
-- (2) record_meta_lead()
-- ============================================================================
create or replace function public.record_meta_lead(
  p_leadgen_id text,
  p_email text,
  p_name text,
  p_phone text,
  p_message text,
  p_details jsonb default '{}'::jsonb,
  p_created_at timestamptz default now()
) returns table (contact_id uuid, inquiry_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag constant text := 'Meta Lead Ad';
  v_contact_id uuid;
  v_inquiry_id uuid;
  v_phone_key text;
begin
  if nullif(trim(coalesce(p_leadgen_id, '')), '') is null then
    raise exception 'p_leadgen_id is required';
  end if;

  p_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  p_phone := nullif(trim(coalesce(p_phone, '')), '');
  p_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Facebook lead');

  if p_email is null and p_phone is null then
    raise exception 'a Meta lead needs an email or a phone number';
  end if;

  -- Serialize concurrent deliveries of the same lead (Meta can retry while
  -- the first attempt is still running).
  perform pg_advisory_xact_lock(hashtext('meta_lead:' || p_leadgen_id));

  select i.contact_id, i.id into v_contact_id, v_inquiry_id
  from inquiries i
  where i.external_id = p_leadgen_id;

  if v_inquiry_id is not null then
    return query select v_contact_id, v_inquiry_id, false;
    return;
  end if;

  -- Match on email first.
  if p_email is not null then
    select c.id into v_contact_id from contacts c where c.email = p_email;
  end if;

  -- Then on phone: the last 10 digits, so "+63 917 123 4567" from Meta
  -- matches "0917-123-4567" typed by staff. Oldest contact wins a tie.
  if v_contact_id is null and p_phone is not null then
    v_phone_key := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
    if length(v_phone_key) = 10 then
      select c.id into v_contact_id
      from contacts c
      where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone_key
      order by c.created_at
      limit 1;
    end if;
  end if;

  if v_contact_id is null then
    insert into contacts (email, name, phone, tags)
    values (p_email, p_name, p_phone, array[v_tag])
    returning id into v_contact_id;
  else
    -- Same rule as record_inquiry() (20260720130816 CR-02): only fill
    -- blanks, never overwrite what staff entered. The email is only filled
    -- when no other contact already owns it.
    update contacts c
    set name = case when coalesce(c.name, '') = '' then p_name else c.name end,
        phone = case when coalesce(c.phone, '') = '' then p_phone else c.phone end,
        email = case
          when c.email is null and p_email is not null
            and not exists (select 1 from contacts o where o.email = p_email)
          then p_email
          else c.email
        end,
        tags = case
          when exists (select 1 from unnest(c.tags) t where lower(t) = lower(v_tag))
          then c.tags
          else c.tags || v_tag
        end
    where c.id = v_contact_id;
  end if;

  insert into inquiries (
    contact_id, request_id, message, source, external_id, source_details, created_at
  )
  values (
    v_contact_id,
    gen_random_uuid(),
    coalesce(nullif(trim(coalesce(p_message, '')), ''), 'Submitted a Meta lead form'),
    'meta_lead_ad',
    p_leadgen_id,
    coalesce(p_details, '{}'::jsonb),
    coalesce(p_created_at, now())
  )
  returning id into v_inquiry_id;

  return query select v_contact_id, v_inquiry_id, true;
end;
$$;

revoke execute on function public.record_meta_lead(text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_meta_lead(text, text, text, text, text, jsonb, timestamptz)
  to service_role;
