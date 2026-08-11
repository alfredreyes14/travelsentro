"use client";

import { useCallback, useState, type ComponentProps } from "react";
import Image, { type ImageProps } from "next/image";

import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for next/image's <Image> that fades in on load
 * instead of popping in abruptly. The base transition-property list covers
 * both opacity and transform (rather than just transition-opacity) because
 * tailwind-merge (via cn()) treats transition-property utilities as
 * mutually exclusive within one class list -- a caller adding its own
 * `transition-transform` (e.g. for a hover-scale effect) would otherwise
 * silently strip this component's fade transition. Callers that want a
 * hover-scale effect should add only the scale-trigger class (e.g.
 * `group-hover:scale-105`), not their own `transition-transform`/`duration-*`
 * -- this component already covers both.
 *
 * Reserved for below-the-fold images -- do not use for priority/LCP images
 * (e.g. the hero carousel), where an opacity delay would hurt perceived
 * load speed.
 */
export function FadeImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  // A server-rendered <img> can finish loading (from browser cache, or a
  // fast connection) before React hydrates and attaches the onLoad handler
  // below -- the browser's "load" event doesn't retroactively fire for a
  // handler attached after the fact, which would otherwise leave the image
  // stuck at opacity-0 forever. Checking `.complete` in this ref callback
  // catches that race on mount.
  const checkAlreadyLoaded = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoaded(true);
  }, []);

  return (
    <Image
      {...props}
      ref={checkAlreadyLoaded}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        "transition-[opacity,transform] duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}

/**
 * Same fade-in-on-load behavior as FadeImage, for the one call site
 * (components/homepage/destinations-section.tsx) that intentionally
 * renders a plain <img> instead of next/image.
 */
export function FadeImg({
  className,
  onLoad,
  ...props
}: ComponentProps<"img">) {
  const [loaded, setLoaded] = useState(false);

  const checkAlreadyLoaded = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoaded(true);
  }, []);

  return (
    <img
      {...props}
      ref={checkAlreadyLoaded}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        "transition-[opacity,transform] duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}
