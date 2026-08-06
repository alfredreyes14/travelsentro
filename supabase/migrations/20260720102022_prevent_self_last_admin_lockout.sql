-- AUTH-03 gap closure (02-20): database-level backstop for the same
-- self-/last-admin admin-role-removal guard actions/users.ts's
-- updateAccount() now enforces at the application layer (02-20 Task 1).
--
-- This trigger is a second, independent enforcement layer -- it does not
-- replace the application-layer guard. It only ever fires for UPDATEs that
-- already passed the existing "admin can update profiles" RLS policy (so
-- the caller is confirmed admin before the trigger runs), matching this
-- phase's established RLS-as-independent-second-layer pattern
-- (02-REVIEW.md WR-06).
--
-- Guard condition: only acts when the row being updated (OLD) is currently
-- an active admin AND the update would remove that (role changing away from
-- 'admin', or is_active flipping to false). Every other case -- editing a
-- Staff row, editing an already-inactive row, promoting to admin, or
-- editing an active admin's non-role/non-active fields -- returns NEW
-- immediately with no check, so normal edits are completely unaffected.
create or replace function public.prevent_self_last_admin_lockout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.role = 'admin' and OLD.is_active = true
    and (NEW.role is distinct from 'admin' or NEW.is_active = false) then

    if auth.uid() = OLD.id then
      raise exception 'Cannot remove admin access from your own account.';
    end if;

    if not exists (
      select 1 from profiles
      where role = 'admin' and is_active = true and id <> OLD.id
    ) then
      raise exception 'Cannot remove admin access from the last remaining admin.';
    end if;
  end if;

  return new;
end;
$$;

create trigger prevent_self_last_admin_lockout
  before update on profiles
  for each row execute procedure public.prevent_self_last_admin_lockout();
