"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Autoplay from "embla-carousel-autoplay";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";

export type HeroSlideDisplay = {
  id: string;
  slideType: "package" | "promo";
  imageUrl: string | null;
  headline: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
};

/**
 * Homepage hero carousel — fully prop-driven, zero Supabase/database
 * awareness. Autoplays every 5s with stopOnInteraction, pauses on
 * hover/focus, and never auto-advances when the visitor has
 * prefers-reduced-motion enabled (RESEARCH.md Pitfall 6 / WCAG 2.2.2).
 */
export function HeroCarousel({ slides }: { slides: HeroSlideDisplay[] }) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Constructing with playOnInit tied to the media query means the plugin
  // never starts moving for reduced-motion users, while manual prev/next
  // via CarouselPrevious/CarouselNext (already keyboard-accessible) still
  // works either way (Pitfall 7 / WCAG 2.2.2).
  // useState (not useRef) because the plugin instance is read during render
  // (`plugins={[plugin]}`) — React's ref rules disallow reading `.current`
  // in the render body, but state reads are fine.
  const [plugin] = useState(() =>
    Autoplay({ delay: 5000, stopOnInteraction: true, playOnInit: !prefersReducedMotion })
  );

  if (slides.length === 0) return null;

  return (
    <Carousel
      plugins={[plugin]}
      opts={{ loop: true }}
      onMouseEnter={() => plugin.stop()}
      onMouseLeave={() => plugin.reset()}
      className="w-full"
    >
      <CarouselContent>
        {slides.map((slide) => (
          <CarouselItem key={slide.id}>
            <div className="relative aspect-[4/5] w-full overflow-hidden md:aspect-video">
              {slide.imageUrl ? (
                <Image
                  src={slide.imageUrl}
                  alt={slide.headline}
                  fill
                  sizes="100vw"
                  priority
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full bg-secondary/10" />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-secondary/20 to-transparent" />

              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 sm:p-8">
                <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-white">
                  {slide.headline}
                </h2>
                {slide.subheading && (
                  <p className="max-w-xl text-base leading-[1.5] text-white/90">
                    {slide.subheading}
                  </p>
                )}
                {slide.ctaLabel && slide.ctaHref && (
                  <div>
                    <Button
                      render={<Link href={slide.ctaHref} />}
                      nativeButton={false}
                      size="lg"
                    >
                      {slide.ctaLabel}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
