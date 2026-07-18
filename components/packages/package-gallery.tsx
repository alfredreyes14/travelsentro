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

type GalleryPhoto = { url: string; alt: string | null };

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

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {photos.map((photo, index) => (
          <button
            key={photo.url}
            type="button"
            onClick={() => {
              setSelectedIndex(index);
              setOpen(true);
            }}
            className="relative aspect-square overflow-hidden rounded-lg bg-secondary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Image
              src={photo.url}
              alt={photo.alt ?? "Package photo"}
              fill
              sizes="(min-width: 768px) 25vw, 50vw"
              className="object-cover"
            />
          </button>
        ))}
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
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </DialogContent>
      </Dialog>
    </>
  );
}
