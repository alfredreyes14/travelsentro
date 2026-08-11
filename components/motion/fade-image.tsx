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
 * Images marked `preload`, `priority`, or `loading="eager"` skip the
 * initial opacity-0 state and render already visible -- hiding an LCP
 * candidate behind an opacity fade until client hydration measurably hurts
 * LCP, and the whole point of marking an image eager/priority is that the
 * browser starts fetching it immediately, so by the time it paints there's
 * usually no "pop-in" moment left to smooth over anyway. Callers that never
 * want a fade at all (not even for below-the-fold images) are better off
 * reaching for a plain next/image `<Image priority>` directly -- simpler
 * than this component with the fade permanently skipped.
 *
 * The stable `fade-image` class name is a hook for the no-JS safety net in
 * app/(public)/layout.tsx's <noscript> block and the `prefers-reduced-motion`
 * override in app/globals.css, same pattern as Reveal's `reveal` class.
 */
export function FadeImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(
    () => props.preload === true || props.priority === true || props.loading === "eager"
  );

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
        "fade-image",
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
 * renders a plain <img> instead of next/image. `loading="eager"` skips the
 * initial opacity-0 state, same reasoning as FadeImage above -- `preload`/
 * `priority` aren't valid HTML `<img>` attributes so there's nothing to
 * check for those here.
 */
export function FadeImg({
  className,
  onLoad,
  ...props
}: ComponentProps<"img">) {
  const [loaded, setLoaded] = useState(() => props.loading === "eager");

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
        "fade-image",
        "transition-[opacity,transform] duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}
