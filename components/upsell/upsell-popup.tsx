"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { shuffle } from "@/lib/upsell/shuffle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` is
    // this layout-scoped singleton's server-fetched initial prop; it never
    // changes after mount, and re-running this on identity isn't how
    // "once per session" is meant to behave.
  }, []);

  if (shuffled.length === 0) return null;

  const current = shuffled[index];
  const canGoPrev = index > 0;
  const canGoNext = index < shuffled.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You Might Also Like</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary/10">
            {current.imageUrl ? (
              <Image
                src={current.imageUrl}
                alt={current.name}
                fill
                sizes="(min-width: 640px) 24rem, 100vw"
                className="object-cover"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-semibold">
              {current.name}
            </h3>
            {current.durationLabel ? (
              <p className="text-sm text-muted-foreground">
                {current.durationLabel}
              </p>
            ) : null}
            <div className="flex items-center gap-1.5 pt-1">
              {current.priceOriginal ? (
                <span className="text-xs text-muted-foreground line-through">
                  {current.priceOriginal}
                </span>
              ) : null}
              <span className="text-sm font-semibold">
                {current.priceFinal}
              </span>
            </div>
          </div>

          <Button
            render={<Link href={`/packages/${current.slug}`} />}
            nativeButton={false}
          >
            View Package
          </Button>

          {shuffled.length > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={!canGoPrev}
                onClick={() => setIndex((i) => i - 1)}
                aria-label="Previous item"
              >
                <ChevronLeftIcon />
              </Button>
              <span className="text-sm text-muted-foreground">
                {index + 1} / {shuffled.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
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
