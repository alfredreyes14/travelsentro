import { PackageGallery } from "@/components/packages/package-gallery";

/**
 * An event's photo gallery: the same grid + lightbox the package page uses
 * (arrow keys, swipe, Esc to close). Renders nothing when there are no
 * photos.
 */
export function EventGallery({ photos, eventName }: { photos: { url: string }[]; eventName: string }) {
  if (photos.length === 0) return null;
  return (
    <PackageGallery
      photos={photos.map((photo, index) => ({
        url: photo.url,
        alt: `${eventName} — photo ${index + 1}`,
      }))}
    />
  );
}
