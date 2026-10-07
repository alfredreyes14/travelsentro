"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";

import { packagePath } from "@/lib/packages/package-url";
import { shuffle } from "@/lib/upsell/shuffle";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

const SESSION_STORAGE_KEY = "ts-upsell-seen";
const OPEN_DELAY_MS = 5000;
const PAGE_SIZE = 3;

// Literal class strings (not interpolated) so Tailwind picks them up.
const GRID_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};
const DIALOG_WIDTH: Record<number, string> = {
  1: "sm:max-w-md",
  2: "sm:max-w-3xl",
  3: "sm:max-w-5xl",
};

export type UpsellItemDisplay = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  durationLabel: string | null;
  priceOriginal: string | null;
  priceFinal: string;
};

/**
 * Site-wide upsell popup, mounted once in (public)/layout.tsx. Shows once
 * per browser session (sessionStorage flag, set the moment it opens,
 * regardless of how it's later closed -- no re-trigger of any kind, per
 * docs/superpowers/specs/2026-09-23-upsell-popup-design.md). Items are
 * shuffled into a random order fresh on every appearance -- has to happen
 * here (client-side), not in the server query, since (public)/layout.tsx
 * is ISR-cached and a server-side shuffle would bake one fixed order into
 * the cached HTML for every visitor within the revalidation window.
 *
 * Shows up to PAGE_SIZE deals per page as a card grid; pagination only
 * appears once there are more deals than fit on one page.
 *
 * Styling follows the "bold/sales-forward" direction chosen during design,
 * pared back toward minimalism on request: plain (not solid-color) cards
 * with a single strong accent color reserved for the price and the CTA,
 * rather than repeating it across a badge, a headline, and a filled
 * background all at once.
 */
export function UpsellPopup({ items }: { items: UpsellItemDisplay[] }) {
  const [open, setOpen] = useState(false);
  const [shuffled, setShuffled] = useState<UpsellItemDisplay[]>([]);
  const [page, setPage] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(SESSION_STORAGE_KEY) === "1";
    } catch {
      // sessionStorage can throw in some private-browsing modes -- treat
      // that the same as "not seen yet" rather than crashing the popup.
      alreadySeen = false;
    }
    if (alreadySeen) return;

    timeoutRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, "1");
      } catch {
        // Best-effort -- if storage isn't writable, the popup simply may
        // show again on the next page in this session, which is a mild
        // degradation, not a crash.
      }
      setShuffled(shuffle(items));
      setPage(0);
      setOpen(true);
    }, OPEN_DELAY_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `items` is this layout-scoped singleton's server-fetched initial
    // prop; it never changes after mount, and re-running this on identity
    // isn't how "once per session" is meant to behave.
  }, []);

  if (shuffled.length === 0) return null;

  const pageCount = Math.ceil(shuffled.length / PAGE_SIZE);
  const pageItems = shuffled.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const canGoPrev = page > 0;
  const canGoNext = page < pageCount - 1;
  // Size the grid to the full item count, not the current page's count, so
  // a partial last page keeps the same card width instead of stretching.
  const columns = Math.min(shuffled.length, PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0",
          DIALOG_WIDTH[columns]
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex flex-col gap-0.5">
            {/* Catchy sales headline -- also the Dialog's real accessible
                title (aria-labelledby), so there's no separate sr-only
                duplicate. Text-only, no fill, so it reads as a label, not
                another loud block of color. */}
            <DialogTitle className="font-heading text-xs font-semibold tracking-wide text-secondary uppercase">
              Exclusive Deal Just For You
            </DialogTitle>
            <p className="font-heading text-lg font-semibold text-foreground sm:text-xl">
              Hand-picked tours at special prices
            </p>
          </div>

          <DialogClose
            aria-label="Close"
            className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </DialogClose>
        </div>

        <ul
          className={cn(
            "grid grid-cols-1 gap-3 px-5 sm:gap-5 sm:px-6",
            GRID_COLUMNS[columns]
          )}
        >
          {pageItems.map((item) => (
            <li key={item.id}>
              <UpsellCard item={item} />
            </li>
          ))}
        </ul>

        {pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3 px-5 pt-4 sm:px-6 sm:pt-5">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canGoPrev}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous deals"
            >
              <ChevronLeftIcon />
            </Button>
            <div className="flex items-center gap-1.5" aria-live="polite">
              {Array.from({ length: pageCount }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === page ? "w-4 bg-secondary" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
              <span className="sr-only">
                Page {page + 1} of {pageCount}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canGoNext}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next deals"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        ) : null}

        <div className="pb-5 sm:pb-6" />
      </DialogContent>
    </Dialog>
  );
}

/**
 * One deal. The whole card is the link -- DialogClose itself renders as the
 * Link (mirrors site-header.tsx's SheetClose+Link pattern) so clicking
 * navigates and closes the dialog in one go; otherwise the modal would stay
 * open, focus-trapped, over the package page the visitor just navigated to.
 *
 * Compact row (thumbnail left) on phones so three deals fit on screen
 * without scrolling; stacked card (photo on top) from `sm` up.
 */
function UpsellCard({ item }: { item: UpsellItemDisplay }) {
  return (
    <DialogClose
      nativeButton={false}
      render={<Link href={packagePath(item)} />}
      className="group flex h-full overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-col"
    >
      <div className="relative w-36 shrink-0 bg-secondary/10 sm:aspect-[4/3] sm:w-full">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="(min-width: 640px) 24rem, 9rem"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:gap-3 sm:p-5">
        <div className="flex flex-col gap-0.5">
          <h3 className="line-clamp-2 font-heading text-base font-semibold text-foreground sm:text-lg">
            {item.name}
          </h3>
          {item.durationLabel ? (
            <p className="text-xs text-muted-foreground sm:text-sm">
              {item.durationLabel}
            </p>
          ) : null}
        </div>

        {/* Original + final price alone communicate the discount -- the
            struck-through number is the "was", the bold orange number is
            the "now". No separate savings badge repeating it a third time. */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2">
          {item.priceOriginal ? (
            <span className="text-xs text-muted-foreground line-through sm:text-sm">
              {item.priceOriginal}
            </span>
          ) : null}
          <span className="text-xl font-bold text-secondary sm:text-2xl">
            {item.priceFinal}
          </span>
        </div>

        <span
          className={cn(
            buttonVariants({ variant: "secondary", size: "lg" }),
            "hidden w-full sm:inline-flex"
          )}
        >
          View Package
        </span>
      </div>
    </DialogClose>
  );
}
