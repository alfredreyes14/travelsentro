"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, StarIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { FadeImage } from "@/components/motion/fade-image";
import { cn } from "@/lib/utils";

export type TestimonialDisplay = {
  id: string;
  customerName: string;
  quote: string;
  rating: number;
  photoUrls: string[];
};

const TESTIMONIALS_PER_PAGE = 3;

// The section is capped at max-w-6xl (1152px) minus padding and split into
// 3 columns, so a card's photo never renders much wider than ~360px.
const CARD_PHOTO_SIZES = "(min-width: 768px) 360px, 100vw";

/**
 * Star rating row — Accent-filled StarIcons, byte-identical to
 * RESEARCH.md Code Example 4.
 */
function StarRating({ rating }: { rating: number }) {
  return (
    <div
      className="flex gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon
          key={i}
          className={
            i < rating
              ? "fill-primary text-primary"
              : "fill-transparent text-muted-foreground"
          }
        />
      ))}
    </div>
  );
}

function SectionHeading() {
  return (
    <div className="flex flex-col gap-2 sm:max-w-2xl">
      <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
        Traveler Stories
      </span>
      <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
        What Our Customers Say
      </h2>
      <p className="text-base leading-[1.5] text-muted-foreground">
        Real experiences from travelers who&apos;ve explored the Philippines
        with us.
      </p>
    </div>
  );
}

/**
 * Full-size viewer for a testimonial's photos. In-card tiles are cropped
 * (object-cover) to keep card heights even, so this is where a photo --
 * often a portrait snapshot or a screenshot of a review -- is shown whole
 * (object-contain), paged with the same carousel as the card.
 */
function PhotoLightbox({
  photoUrls,
  customerName,
  startIndex,
  open,
  onOpenChange,
}: {
  photoUrls: string[];
  customerName: string;
  startIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hasMultiple = photoUrls.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl lg:max-w-3xl">
        <DialogTitle className="sr-only">
          Photos from {customerName}
        </DialogTitle>

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
          key={startIndex}
          opts={{ startIndex, loop: hasMultiple }}
        >
          <CarouselContent>
            {photoUrls.map((url, index) => (
              <CarouselItem key={url}>
                <div className="relative h-[70dvh] w-full overflow-hidden rounded-lg bg-secondary/10">
                  <FadeImage
                    src={url}
                    alt={`Photo ${index + 1} of ${photoUrls.length} from ${customerName}`}
                    fill
                    sizes="(min-width: 1024px) 740px, (min-width: 640px) 640px, 100vw"
                    className="object-contain"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {hasMultiple && (
            <>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </>
          )}
        </Carousel>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A testimonial's photos inside its card. One photo renders as a single
 * tile; several become a swipeable carousel with prev/next arrows, a
 * "2 / 4" counter, and dot pagination. Either way, tapping a photo opens
 * the full-size lightbox at that photo.
 */
function TestimonialPhotos({
  photoUrls,
  customerName,
}: {
  photoUrls: string[];
  customerName: string;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  if (photoUrls.length === 0) return null;

  const hasMultiple = photoUrls.length > 1;

  const renderTile = (url: string, index: number) => (
    <button
      type="button"
      onClick={() => setLightboxIndex(index)}
      aria-label={`View photo ${index + 1} of ${photoUrls.length} from ${customerName}`}
      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-secondary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <FadeImage
        src={url}
        alt=""
        fill
        sizes={CARD_PHOTO_SIZES}
        className="transform-gpu object-cover duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:scale-105"
      />
    </button>
  );

  return (
    <div className="flex w-full flex-col gap-2">
      {hasMultiple ? (
        <Carousel setApi={setApi} opts={{ loop: true }} className="w-full">
          <CarouselContent>
            {photoUrls.map((url, index) => (
              <CarouselItem key={url}>{renderTile(url, index)}</CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-2 bg-background/85 backdrop-blur-sm" />
          <CarouselNext className="right-2 bg-background/85 backdrop-blur-sm" />
          <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
            {selectedIndex + 1} / {photoUrls.length}
          </span>
        </Carousel>
      ) : (
        renderTile(photoUrls[0]!, 0)
      )}

      {hasMultiple && (
        <div className="flex justify-center gap-1.5">
          {photoUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => api?.scrollTo(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-current={index === selectedIndex}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === selectedIndex
                  ? "w-4 bg-primary"
                  : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
              )}
            />
          ))}
        </div>
      )}

      <PhotoLightbox
        photoUrls={photoUrls}
        customerName={customerName}
        startIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onOpenChange={(open) => !open && setLightboxIndex(null)}
      />
    </div>
  );
}

function TestimonialCard({ testimonial }: { testimonial: TestimonialDisplay }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-4">
      <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {testimonial.customerName}
      </h3>
      <StarRating rating={testimonial.rating} />
      <p className="text-base leading-[1.5] text-muted-foreground">
        &ldquo;{testimonial.quote}&rdquo;
      </p>
      {testimonial.photoUrls.length > 0 && (
        // mt-auto pins photos to the card's bottom edge so they line up
        // across a row even when quotes differ in length.
        <div className="mt-auto w-full pt-1">
          <TestimonialPhotos
            photoUrls={testimonial.photoUrls}
            customerName={testimonial.customerName}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * Homepage testimonials section — pure prop-driven, zero Supabase
 * awareness. Pages through testimonials TESTIMONIALS_PER_PAGE at a time on
 * the client (the homepage is ISR-cached, so URL-driven pagination would
 * force it dynamic). Renders skeleton placeholder cards (rather than
 * disappearing) when no admin-entered testimonials exist yet.
 */
export function TestimonialsSection({
  testimonials,
}: {
  testimonials: TestimonialDisplay[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState(1);

  if (testimonials.length === 0) {
    return (
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
        <SectionHeading />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="flex flex-col items-start gap-3 p-4">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </Card>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Customer stories coming soon.
        </p>
      </section>
    );
  }

  const totalPages = Math.ceil(testimonials.length / TESTIMONIALS_PER_PAGE);
  const currentPage = Math.min(page, totalPages);
  const pageItems = testimonials.slice(
    (currentPage - 1) * TESTIMONIALS_PER_PAGE,
    currentPage * TESTIMONIALS_PER_PAGE
  );

  function goToPage(next: number) {
    setPage(next);
    // Cards on the next page can be shorter than the current ones (fewer
    // photos), which would leave the reader scrolled past the section --
    // bring its top back into view only when it has scrolled out above.
    const top = sectionRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <section
      ref={sectionRef}
      className="mx-auto flex max-w-6xl scroll-mt-24 flex-col gap-8 px-6 py-12 sm:px-8"
    >
      <SectionHeading />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {pageItems.map((testimonial) => (
          <TestimonialCard key={testimonial.id} testimonial={testimonial} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Testimonials pagination"
          className="flex items-center justify-center gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            <ChevronLeftIcon />
            <span className="sr-only">Previous testimonials</span>
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            <ChevronRightIcon />
            <span className="sr-only">Next testimonials</span>
          </Button>
        </nav>
      )}
    </section>
  );
}
