-- Checks the per-module RLS rules from
-- supabase/migrations/20261119120000_module_crud_permissions.sql against a
-- LOCAL Supabase database. Everything runs in one transaction and is rolled
-- back. Any failed check raises an exception.
--
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f scripts/verify-module-permissions.sql

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'none@perm.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'reader@perm.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'creator@perm.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'admin@perm.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'inactive@perm.test', 'authenticated', 'authenticated');

update profiles set permissions = '{"leads": {"read": true}, "packages": {"read": true}}'
  where id = '00000000-0000-0000-0000-0000000000a2';
update profiles set permissions = '{"packages": {"read": true, "create": true}, "content": {"read": true, "create": true}}'
  where id = '00000000-0000-0000-0000-0000000000a3';
update profiles set role = 'admin'
  where id = '00000000-0000-0000-0000-0000000000a4';
update profiles set is_active = false, permissions = '{"leads": {"read": true}}'
  where id = '00000000-0000-0000-0000-0000000000a5';

insert into contacts (name, email) values ('Perm Lead', 'perm-lead@perm.test');
insert into faqs (question, answer, is_published) values ('Perm Q', 'Perm A', false);
insert into destinations (id, name, slug, region)
  values ('00000000-0000-0000-0000-00000000c001', 'Perm Destination', 'perm-destination', 'local');
insert into packages (id, name, price_per_pax, is_published)
  values ('00000000-0000-0000-0000-00000000b001', 'Perm Draft', 0, false);

create function pg_temp.check(ok boolean, label text) returns void
language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end;
$$;

create function pg_temp.as_user(u uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.affected(stmt text) returns int
language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return -1; -- RLS rejected the new row
end;
$$;

-- New accounts start with nothing.
select pg_temp.check(
  (select permissions = '{}'::jsonb and role = 'staff' from profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'new account: staff with no permissions');

-- No permissions --------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.check((select count(*) from contacts where email = 'perm-lead@perm.test') = 0, 'none: cannot read leads');
select pg_temp.check((select count(*) from faqs where question = 'Perm Q') = 0, 'none: cannot read unpublished FAQs');
select pg_temp.check(pg_temp.affected($$insert into faqs (question, answer) values ('x', 'y')$$) = -1, 'none: cannot create FAQs');
select pg_temp.check((select count(*) from profiles) = 1, 'none: sees only own profile');
reset role;

-- Read only -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select pg_temp.check((select count(*) from contacts where email = 'perm-lead@perm.test') = 1, 'reader: can read leads');
select pg_temp.check(pg_temp.affected($$insert into contacts (name, email) values ('x', 'x@perm.test')$$) = -1, 'reader: cannot create leads');
select pg_temp.check(pg_temp.affected($$update contacts set name = 'changed' where email = 'perm-lead@perm.test'$$) = 0, 'reader: cannot update leads');
select pg_temp.check((select count(*) from packages where name = 'Perm Draft') = 1, 'reader: can read draft packages');
select pg_temp.check(pg_temp.affected($$update packages set name = 'changed' where name = 'Perm Draft'$$) = 0, 'reader: cannot update packages');
reset role;

-- Create only -----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
set local role authenticated;
select pg_temp.check(pg_temp.affected($$insert into faqs (question, answer) values ('Creator Q', 'A')$$) = 1, 'creator: can create FAQs');
select pg_temp.check(pg_temp.affected($$update faqs set answer = 'changed'$$) = 0, 'creator: cannot update FAQs');
select pg_temp.check(pg_temp.affected($$delete from faqs$$) = 0, 'creator: cannot delete FAQs');
select pg_temp.check(
  pg_temp.affected($$update packages set name = 'Saved Draft' where id = '00000000-0000-0000-0000-00000000b001'$$) = 1,
  'creator: can fill in a never-saved package draft');
select pg_temp.check(
  pg_temp.affected($$insert into package_inclusions (package_id, kind, label) values ('00000000-0000-0000-0000-00000000b001', 'included', 'Hotel')$$) = 1,
  'creator: can add rows to a never-saved package draft');
select pg_temp.check((select count(*) from contacts) = 0, 'creator: no leads permission, sees no leads');
select pg_temp.check(
  pg_temp.affected($$insert into destinations (name, slug, region) values ('x', 'x-perm', 'local')$$) = -1,
  'creator: packages create does not cover destinations');
reset role;

-- Saved packages need update, even for the creator.
update packages
  set destination_id = '00000000-0000-0000-0000-00000000c001'
  where id = '00000000-0000-0000-0000-00000000b001';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
set local role authenticated;
select pg_temp.check(
  pg_temp.affected($$update packages set name = 'Changed' where id = '00000000-0000-0000-0000-00000000b001'$$) = 0,
  'creator: cannot edit a saved package');
reset role;

-- Inactive accounts get nothing, whatever their permissions say.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
set local role authenticated;
select pg_temp.check((select count(*) from contacts) = 0, 'inactive: cannot read leads');
reset role;

-- Admin -----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
set local role authenticated;
select pg_temp.check((select count(*) from contacts where email = 'perm-lead@perm.test') = 1, 'admin: can read leads');
select pg_temp.check(pg_temp.affected($$update faqs set answer = 'admin' where question = 'Perm Q'$$) = 1, 'admin: can update FAQs');
select pg_temp.check(pg_temp.affected($$delete from faqs where question = 'Perm Q'$$) = 1, 'admin: can delete FAQs');
select pg_temp.check((select count(*) from profiles) >= 5, 'admin: sees every profile');
select pg_temp.check(
  pg_temp.affected($$update profiles set permissions = '{"quotes": {"read": true}}' where id = '00000000-0000-0000-0000-0000000000a1'$$) = 1,
  'admin: can change staff permissions');
reset role;

-- Staff cannot grant themselves anything.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
set local role authenticated;
select pg_temp.check(
  pg_temp.affected($$update profiles set permissions = '{"quotes": {"read": true}}' where id = '00000000-0000-0000-0000-0000000000a2'$$) = 0,
  'staff: cannot change own permissions');
reset role;

rollback;
