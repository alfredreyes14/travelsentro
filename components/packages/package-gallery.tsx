"use client";

import { useEffect, useState } from "react";
import { XIcon, ZoomIn, ZoomOut } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/motion/fade-image";
import { cn } from "@/lib/utils";

type GalleryPhoto = { url: string; alt: string | null };

// Lightbox zoom: 100% is fit-to-width (already readable for a tall
// itinerary poster), stepping up to 300% for fine print. Zoom resets to
// 100% whenever the visible photo changes.
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

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
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);

  // Reset zoom when the reader pages to a different photo inside the
  // lightbox (arrow buttons, swipe, or arrow keys) -- a zoom level chosen
  // for one poster rarely makes sense for the next.
  useEffect(() => {
    if (!carouselApi) return;
    const reset = () => setZoom(MIN_ZOOM);
    carouselApi.on("select", reset);
    return () => {
      carouselApi.off("select", reset);
    };
  }, [carouselApi]);

  const zoomIn = () =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () =>
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));

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
                setZoom(MIN_ZOOM);
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
              <FadeImage
                src={photo.url}
                alt={photo.alt ?? "Package photo"}
                fill
                sizes={
                  hasHeroTile && index === 0
                    ? "(min-width: 768px) 50vw, 100vw"
                    : hasHeroTile
                      ? "(min-width: 768px) 25vw, 50vw"
                      : isSinglePhoto
                        ? // The gallery is capped by the page's max-w-4xl
                          // (896px) wrapper minus its sm:px-8 padding, so a
                          // full-bleed single photo never actually renders
                          // wider than ~832px -- a bare "100vw" here both
                          // over-requests on large screens and trips
                          // next/image's dev-only "not rendered at full
                          // viewport width" warning.
                          "(min-width: 896px) 832px, 100vw"
                        : "50vw"
                }
                preload={index === 0}
                className="object-cover group-hover:scale-105"
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setZoom(MIN_ZOOM);
        }}
      >
        {/*
         * showCloseButton={false}: the shared DialogContent's default close
         * is a bare ghost icon that all but disappears against a photo. This
         * lightbox swaps in a frosted chip -- same treatment as the zoom
         * cluster on the opposite corner -- so it stays legible over any
         * poster.
         */}
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl lg:max-w-3xl"
        >
          <DialogTitle className="sr-only">Photo gallery</DialogTitle>

          <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5 rounded-lg bg-popover/90 p-0.5 ring-1 ring-foreground/10 backdrop-blur-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <ZoomOut />
            </Button>
            <span className="w-9 text-center text-[11px] font-medium tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <ZoomIn />
            </Button>
          </div>

          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="absolute top-2 right-2 z-10 rounded-lg bg-popover/90 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm hover:bg-popover"
              />
            }
          >
            <XIcon className="size-5" />
            <span className="sr-only">Close</span>
          </DialogClose>

          <Carousel
            key={selectedIndex}
            setApi={setCarouselApi}
            opts={{ startIndex: selectedIndex, loop: true }}
          >
            <CarouselContent>
              {photos.map((photo, index) => (
                <CarouselItem key={photo.url}>
                  {/*
                   * These "photos" are usually full-height itinerary
                   * posters, not landscape snapshots -- a fixed aspect-ratio
                   * box + object-cover would crop away most of the poster.
                   * width/height={0} + sizes lets next/image stay responsive
                   * without known intrinsic dimensions; at 100% zoom it fits
                   * the dialog width, and each zoom step widens it further
                   * inside this scroll viewport so the reader can pan around
                   * the fine print.
                   */}
                  <div className="max-h-[80dvh] w-full overflow-auto overscroll-contain rounded-lg bg-secondary/10">
                    <FadeImage
                      src={photo.url}
                      alt={photo.alt ?? `Photo ${index + 1}`}
                      width={0}
                      height={0}
                      sizes="(min-width: 1024px) 740px, (min-width: 640px) 640px, 100vw"
                      style={{ width: `${zoom * 100}%` }}
                      // No width transition here: FadeImage folds caller
                      // classes through cn()/tailwind-merge, and any
                      // transition-* utility would evict its own
                      // opacity/transform fade. Zoom just snaps between steps.
                      className="mx-auto block h-auto max-w-none"
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
