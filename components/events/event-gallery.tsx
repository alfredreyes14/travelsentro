import { ImageIcon } from "lucide-react";

import { PackageGallery } from "@/components/packages/package-gallery";

/**
 * An event's photo gallery: the same grid + lightbox the package page uses
 * (arrow keys, swipe, Esc to close). Shows a "coming soon" note when there
 * are no photos yet.
 */
export function EventGallery({ photos, eventName }: { photos: { url: string }[]; eventName: string }) {
  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/5 px-6 py-12 text-center">
        <ImageIcon className="size-8 text-secondary" strokeWidth={1.75} aria-hidden="true" />
        <p className="font-heading text-base font-semibold">Photos coming soon</p>
        <p className="text-sm text-muted-foreground">
          We&apos;ll share photos from this event here.
        </p>
      </div>
    );
  }

  return (
    <PackageGallery
      photos={photos.map((photo, index) => ({
        url: photo.url,
        alt: `${eventName} — photo ${index + 1}`,
      }))}
    />
  );
}
