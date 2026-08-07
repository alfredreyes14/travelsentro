"use client";

import { useState } from "react";
import Image from "next/image";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type GalleryPhoto = { url: string; alt: string | null };

// Caps the grid to one hero tile + 4 more, exactly filling the 2x4 hero
// layout's cell count — packages can have many more photos than fit
// on-screen, so beyond this the last tile becomes a "+N more" overlay
// that opens the lightbox (which always carries the full photo list).
const MAX_VISIBLE_PHOTOS = 5;

/**
 * Responsive thumbnail grid → lightbox dialog with carousel navigation.
 * Keyboard nav, touch swipe, focus trap, and ESC/click-outside-to-close are
 * all delegated to Radix-shape Dialog + Embla-backed Carousel primitives
 * (@base-ui/react under this project's shadcn preset) — no hand-rolled
 * keyboard/touch-event handling here.
 */
export function PackageGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (photos.length === 0) return null;

  // Only promote the first photo to a 2x2 hero tile when there are enough
  // photos to fill the remaining cells — otherwise a sparse gallery (1-2
  // photos) is left with an awkward empty grid cell. Below that threshold,
  // the column count matches the photo count exactly so the grid always
  // fills the full row width instead of leaving dead space next to it.
  const hasHeroTile = photos.length >= 3;
  const isSinglePhoto = photos.length === 1;
  const visiblePhotos = hasHeroTile
    ? photos.slice(0, MAX_VISIBLE_PHOTOS)
    : photos;
  const hiddenCount = photos.length - visiblePhotos.length;

  return (
    <>
      <div
        className={cn(
          "grid gap-2",
          hasHeroTile
            ? "grid-cols-2 md:grid-cols-4"
            : isSinglePhoto
              ? "grid-cols-1"
              : "grid-cols-2"
        )}
      >
        {visiblePhotos.map((photo, index) => {
          const isLastVisible = index === visiblePhotos.length - 1;
          const showMoreOverlay = isLastVisible && hiddenCount > 0;

          return (
            <button
              key={photo.url}
              type="button"
              onClick={() => {
                setSelectedIndex(index);
                setOpen(true);
              }}
              aria-label={
                showMoreOverlay
                  ? `Open photo gallery, ${hiddenCount} more photo${hiddenCount === 1 ? "" : "s"}`
                  : `Open photo ${index + 1} of ${photos.length}`
              }
              className={cn(
                "group relative overflow-hidden rounded-lg bg-secondary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                // A shared aspect ratio per tile (rather than a fixed pixel
                // height) keeps width and height scaling together, so tiles
                // stay a natural landscape shape instead of turning into
                // tall squares on narrow screens or long letterboxed strips
                // on wide ones. The hero tile spans 2 cols + 2 rows, which
                // resolves to the same aspect ratio at 2x the size, so it
                // matches the other tiles' shape rather than distorting.
                isSinglePhoto ? "aspect-[16/9]" : "aspect-[4/3]",
                hasHeroTile && index === 0 && "col-span-2 row-span-2"
              )}
            >
              <Image
                src={photo.url}
                alt={photo.alt ?? "Package photo"}
                fill
                sizes={
                  hasHeroTile && index === 0
                    ? "(min-width: 768px) 50vw, 100vw"
                    : hasHeroTile
                      ? "(min-width: 768px) 25vw, 50vw"
                      : isSinglePhoto
                        ? "100vw"
                        : "50vw"
                }
                preload={index === 0}
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {showMoreOverlay && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[15px] font-semibold text-white">
                  +{hiddenCount} more
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle className="sr-only">Photo gallery</DialogTitle>
          <Carousel
            key={selectedIndex}
            opts={{ startIndex: selectedIndex, loop: true }}
          >
            <CarouselContent>
              {photos.map((photo, index) => (
                <CarouselItem key={photo.url}>
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg">
                    <Image
                      src={photo.url}
                      alt={photo.alt ?? `Photo ${index + 1}`}
                      fill
                      sizes="(min-width: 768px) 640px, 100vw"
                      className="object-cover"
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
          </Carousel>
        </DialogContent>
      </Dialog>
    </>
  );
}
