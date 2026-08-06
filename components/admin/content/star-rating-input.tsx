"use client";

import { StarIcon } from "lucide-react";

/**
 * Clickable 1-5 star-rating input. Reuses the identical fill/muted className
 * logic as the public StarRating display (RESEARCH.md Code Example 4), but
 * as a genuine clickable input variant rather than a read-only display.
 */
export function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onChange(index + 1)}
          aria-label={`Rate ${index + 1} star${index === 0 ? "" : "s"}`}
          className="p-0.5"
        >
          <StarIcon
            className={
              index < value
                ? "fill-primary text-primary"
                : "fill-transparent text-muted-foreground"
            }
          />
        </button>
      ))}
    </div>
  );
}
