-- Adds a computed, normalized [0,1] focal point to promo-type hero slide
-- images (hero_slides.image_storage_path), used as CSS object-position at
-- render time instead of a fixed center crop. Both columns are nullable --
-- null means "no focal point yet," and rendering falls back to the current
-- default-center crop, so every existing row keeps working unchanged until
-- scripts/backfill-hero-slide-focal-points.ts (or a future upload) fills
-- them in. See docs/superpowers/specs/2026-08-19-hero-slide-focal-point-design.md.
alter table hero_slides
  add column focal_x numeric,
  add column focal_y numeric;

comment on column hero_slides.focal_x is
  'Normalized [0,1] horizontal focal point for object-position cropping of image_storage_path. Null = default center crop.';
comment on column hero_slides.focal_y is
  'Normalized [0,1] vertical focal point for object-position cropping of image_storage_path. Null = default center crop.';
