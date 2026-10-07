"use client";

import Form from "next/form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Wait this long after the last keystroke before searching, so typing
 * "boracay" fires one navigation instead of seven. */
const SEARCH_DEBOUNCE_MS = 350;

function searchHref(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `/packages?${new URLSearchParams({ q: trimmed })}` : "/packages";
}

/** Searches as the visitor types (debounced router.replace), and still works
 * as a plain GET form to /packages?q=... -- Enter (a single-field form
 * submits implicitly) and no-JS visitors both go through next/form. */
export function PackageSearch({
  defaultQuery,
  className,
}: {
  defaultQuery?: string;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the URL when it changes from outside the field (e.g. "Clear
  // filter", back button), but never while the visitor is typing -- a
  // slower, older search landing mid-typing would otherwise overwrite what
  // they've typed since.
  const [prevDefaultQuery, setPrevDefaultQuery] = useState(defaultQuery);
  if (defaultQuery !== prevDefaultQuery) {
    setPrevDefaultQuery(defaultQuery);
    if (!isFocused) setValue(defaultQuery ?? "");
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Skip no-op navigations (e.g. adding a trailing space).
      if (next.trim() === (defaultQuery ?? "")) return;
      startTransition(() => {
        // replace, not push: one history entry per search, not per keystroke.
        router.replace(searchHref(next), { scroll: false });
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <Form
      action="/packages"
      role="search"
      className={cn("w-full max-w-xl", className)}
      onSubmit={() => {
        // The form navigates immediately; drop the pending debounced one.
        if (debounceRef.current) clearTimeout(debounceRef.current);
      }}
    >
      <div className="relative">
        {isPending ? (
          <Loader2Icon
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 animate-spin text-primary"
            aria-hidden="true"
          />
        ) : (
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-primary"
            aria-hidden="true"
          />
        )}
        <Input
          type="search"
          name="q"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search packages or destinations..."
          aria-label="Search packages"
          maxLength={100}
          // White fill + darker border + shadow so the field stands out
          // against the sand page background instead of blending into it.
          className="h-12 rounded-xl border-primary/25 bg-card pl-11 text-base shadow-md md:text-base"
        />
      </div>
    </Form>
  );
}
