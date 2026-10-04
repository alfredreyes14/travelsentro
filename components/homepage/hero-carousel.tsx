"use client";

import { useState } from "react";
import Image from "next/image";
import Autoplay from "embla-carousel-autoplay";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { HERO_IMAGE_HEIGHT, HERO_IMAGE_WIDTH } from "@/lib/constants";

const DEFAULT_HERO_IMAGE = "/default-hero.jpg";

// Every slide -- and the default image -- is framed at the default banner's
// own ratio, so uploads at the recommended size show whole and the hero
// doesn't change height when the first slide is added.
const HERO_FRAME_STYLE = {
  aspectRatio: `${HERO_IMAGE_WIDTH} / ${HERO_IMAGE_HEIGHT}`,
};

export type HeroSlideDisplay = {
  id: string;
  imageUrl: string;
};

/**
 * Homepage hero carousel — fully prop-driven, zero Supabase/database
 * awareness. Autoplays every 5s with stopOnInteraction, pauses on
 * hover/focus, and never auto-advances when the visitor has
 * prefers-reduced-motion enabled (RESEARCH.md Pitfall 6 / WCAG 2.2.2).
 * Slides are plain admin-uploaded images shown whole at the default
 * banner's ratio on every screen size (the admin recommends that exact
 * size), so banners with text baked in are never cropped -- no overlay text
 * is drawn on top.
 * Falls back to a single static default hero image (no carousel chrome)
 * when the backend has no hero slides configured yet -- the carousel only
 * appears once there's actual admin-managed slide content to page through.
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

  if (slides.length === 0) {
    return (
      <div className="relative w-full overflow-hidden" style={HERO_FRAME_STYLE}>
        <Image
          src={DEFAULT_HERO_IMAGE}
          alt="TravelSentro"
          fill
          sizes="100vw"
          priority
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <Carousel
      plugins={[plugin]}
      opts={{ loop: true }}
      onMouseEnter={() => plugin.stop()}
      onMouseLeave={() => plugin.reset()}
      className="w-full"
    >
      <CarouselContent>
        {slides.map((slide, index) => (
          <CarouselItem key={slide.id}>
            <div
              className="relative w-full overflow-hidden bg-secondary/10"
              style={HERO_FRAME_STYLE}
            >
              <Image
                src={slide.imageUrl}
                alt={`TravelSentro featured image ${index + 1} of ${slides.length}`}
                fill
                sizes="100vw"
                priority={index === 0}
                className="object-cover"
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
