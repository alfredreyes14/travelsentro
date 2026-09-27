"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";

import { shuffle } from "@/lib/upsell/shuffle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

const SESSION_STORAGE_KEY = "ts-upsell-seen";
const OPEN_DELAY_MS = 1500;

export type UpsellItemDisplay = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  durationLabel: string | null;
  priceOriginal: string | null;
  priceFinal: string;
  /** Formatted discount amount (e.g. "₱2,000"), null when there's no discount. */
  savingsLabel: string | null;
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
 * Styling follows the "bold/sales-forward" direction chosen during design:
 * full-bleed photo with a savings badge, a dark navy info panel (matching
 * the site's --primary brand color) holding the price callout and CTA, so
 * the popup reads as a deal rather than a generic dialog.
 */
export function UpsellPopup({ items }: { items: UpsellItemDisplay[] }) {
  const [open, setOpen] = useState(false);
  const [shuffled, setShuffled] = useState<UpsellItemDisplay[]>([]);
  const [index, setIndex] = useState(0);
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
      setIndex(0);
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

  const current = shuffled[index];
  const canGoPrev = index > 0;
  const canGoNext = index < shuffled.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-sm"
      >
        <div className="relative aspect-video w-full bg-secondary/10">
          {current.imageUrl ? (
            <Image
              src={current.imageUrl}
              alt={current.name}
              fill
              sizes="(min-width: 640px) 24rem, 100vw"
              className="object-cover"
            />
          ) : null}

          {current.savingsLabel ? (
            <Badge
              variant="secondary"
              className="absolute top-3 left-3 h-auto px-3 py-1 text-sm font-semibold shadow-md"
            >
              Save {current.savingsLabel}
            </Badge>
          ) : null}

          <DialogClose
            nativeButton={false}
            aria-label="Close"
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
          >
            <XIcon className="size-4" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-3 bg-primary p-5 text-primary-foreground">
          <div className="flex flex-col gap-0.5">
            {/* Catchy, visible sales headline -- also the Dialog's real
                accessible title (aria-labelledby), so there's no separate
                sr-only duplicate. */}
            <DialogTitle className="font-heading text-xs font-bold tracking-wide text-secondary uppercase">
              Exclusive Deal Just For You
            </DialogTitle>
            <h3 className="font-heading text-lg font-semibold">
              {current.name}
            </h3>
            {current.durationLabel ? (
              <p className="text-xs text-primary-foreground/70">
                {current.durationLabel}
              </p>
            ) : null}
          </div>

          <div className="flex items-baseline gap-2">
            {current.priceOriginal ? (
              <span className="text-sm text-primary-foreground/60 line-through">
                {current.priceOriginal}
              </span>
            ) : null}
            <span className="text-2xl font-bold text-secondary">
              {current.priceFinal}
            </span>
          </div>

          {/* DialogClose itself renders as the Link (mirrors
              site-header.tsx's SheetClose+Link pattern) rather than
              nesting a separate Button-as-Link inside it, so clicking
              "View Package" both navigates and closes the dialog --
              otherwise the modal would stay open, focus-trapped, over
              the package page the visitor just navigated to. */}
          <DialogClose
            nativeButton={false}
            render={<Link href={`/packages/${current.slug}`} />}
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            View Package
          </DialogClose>

          {shuffled.length > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                disabled={!canGoPrev}
                onClick={() => setIndex((i) => i - 1)}
                aria-label="Previous item"
              >
                <ChevronLeftIcon />
              </Button>
              <span className="text-xs text-primary-foreground/60">
                {index + 1} / {shuffled.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                disabled={!canGoNext}
                onClick={() => setIndex((i) => i + 1)}
                aria-label="Next item"
              >
                <ChevronRightIcon />
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
