import { StarIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export type TestimonialDisplay = {
  id: string;
  customerName: string;
  quote: string;
  rating: number;
  photoUrl: string | null;
};

/**
 * Derives up-to-2-character initials from a customer name (first letter of
 * each whitespace-separated word, uppercased) for the Avatar fallback.
 */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

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

/**
 * Homepage testimonials section — pure prop-driven, zero Supabase
 * awareness. Returns null on an empty array per UI-SPEC's public homepage
 * empty-state rule (no placeholder/"coming soon" copy).
 */
export function TestimonialsSection({
  testimonials,
}: {
  testimonials: TestimonialDisplay[];
}) {
  if (testimonials.length === 0) return null;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
      <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
        What Our Customers Say
      </h2>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <Card
            key={testimonial.id}
            className="flex flex-col items-start gap-3 p-4"
          >
            <Avatar size="lg">
              {testimonial.photoUrl ? (
                <AvatarImage
                  src={testimonial.photoUrl}
                  alt={testimonial.customerName}
                />
              ) : (
                <AvatarFallback>
                  {getInitials(testimonial.customerName)}
                </AvatarFallback>
              )}
            </Avatar>
            <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
              {testimonial.customerName}
            </h3>
            <StarRating rating={testimonial.rating} />
            <p className="text-base leading-[1.5] text-muted-foreground">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
