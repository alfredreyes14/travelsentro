-- Drop the Supabase Storage buckets and their RLS policies now that image
-- storage has moved to Cloudflare R2 (docs/superpowers/specs/2026-08-08-r2-image-storage-design.md).
-- Dev-only project -- no production images to preserve, run only after
-- Task 5's end-to-end verification has confirmed R2 fully replaces them.

drop policy "manage_packages can upload package photos" on storage.objects;
drop policy "manage_packages can update package photos" on storage.objects;
drop policy "manage_packages can delete package photos" on storage.objects;
drop policy "Public read access for package photos" on storage.objects;

drop policy "manage_packages can upload site content" on storage.objects;
drop policy "manage_packages can update site content" on storage.objects;
drop policy "manage_packages can delete site content" on storage.objects;
drop policy "Public read access for site content" on storage.objects;

-- This project's storage schema has a protect_delete() trigger that blocks
-- direct DELETEs on storage tables unless this session-level GUC is set;
-- required to actually drop the (already-empty) bucket rows below.
set storage.allow_delete_query = 'true';

delete from storage.objects where bucket_id in ('package-photos', 'site-content');
delete from storage.buckets where id in ('package-photos', 'site-content');
