-- Drops contacts.status, the stage system's predecessor
-- (docs/superpowers/specs/2026-10-13-contacts-b2c-b2b-design.md, "Backfill
-- and the old status column").
--
-- 20261013120000_contacts_b2c_b2b.sql kept status, plus a trigger syncing it
-- with stage, only because staging and production share this database and
-- production still ran code that read and wrote status. That release is now
-- on master and no code uses status, so the trigger, its function and the
-- column go. Dropping the column also drops its check constraint.
--
-- Order matters: the trigger's function reads new.status, so it must be
-- gone before the column is.

drop trigger contacts_sync_status_stage on contacts;
drop function public.contacts_sync_status_stage();

alter table contacts drop column status;
