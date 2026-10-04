-- Testimonials move from a single optional photo to an ordered list of
-- photos (a review can attach several). Array order is display order.
-- Existing single photos are carried over as a one-element array before the
-- old column is dropped, so no testimonial loses its image.
alter table testimonials
  add column photo_storage_paths text[] not null default '{}';

update testimonials
  set photo_storage_paths = array[photo_storage_path]
  where photo_storage_path is not null;

alter table testimonials drop column photo_storage_path;

comment on column testimonials.photo_storage_paths is
  'Ordered R2 object keys for the testimonial''s photos. Empty array = no photos.';
