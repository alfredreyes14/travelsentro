"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fades + slides children up into view the first time they scroll into the
 * viewport (fires once, then stops observing). Renders children immediately
 * visible -- no observer, no animation classes -- when the visitor has
 * `prefers-reduced-motion: reduce` set.
 *
 * The stable `reveal` class name is a hook for the no-JS safety net in
 * app/(public)/layout.tsx's <noscript> block, which forces full visibility
 * when scripting is disabled -- this component's hidden-until-observed
 * state is otherwise baked into the server-rendered HTML (it reflects
 * useState's initial value before any effect runs), so a visitor without
 * JavaScript would otherwise never see the content revealed.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "reveal",
        isVisible
          ? "animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700 ease-out"
          : "opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
