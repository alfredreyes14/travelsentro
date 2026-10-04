-- Hero slides become plain uploaded images: no package link, no headline/
-- subheading/CTA overlay, no focal point (the carousel now frames every image
-- at the default banner's 2400x731 ratio, so there is nothing to crop). A
-- slide is just an ordered image.
--
-- Package-type slides are deleted rather than converted: they never had an
-- image of their own (they borrowed the linked package's first photo), and
-- pointing a hero slide at a package photo's R2 key would break the hero the
-- moment that photo is removed from the package. Promo slides without an
-- image can't render as image-only slides either, so they go too.
delete from hero_slides
  where slide_type = 'package' or image_storage_path is null;

alter table hero_slides drop constraint hero_slides_package_shape;

alter table hero_slides
  drop column slide_type,
  drop column package_id,
  drop column headline,
  drop column subheading,
  drop column cta_label,
  drop column external_link,
  drop column focal_x,
  drop column focal_y;

alter table hero_slides alter column image_storage_path set not null;

comment on column hero_slides.image_storage_path is
  'R2 object key of the slide image (recommended 2400x731, same as the default banner).';
