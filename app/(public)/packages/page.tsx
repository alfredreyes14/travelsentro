import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { PackageCard } from "@/components/packages/package-card";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { MONTH_OPTIONS } from "@/lib/months";
import type { Database } from "@/types/database";

/** First/last day of the given month as "YYYY-MM-DD" strings (UTC-based, no
 * timezone drift), used to match package_travel_dates.travel_date_from
 * falling within that month without needing EXTRACT()/an RPC. */
function monthDateRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export const metadata: Metadata = {
  title: "Tour Packages | TravelSentro",
  description:
    "Browse TravelSentro's tour packages across the Philippines and reach out on WhatsApp or Facebook to start planning your trip.",
};

type PackageWithPhotos = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Pick<
    Database["public"]["Tables"]["package_photos"]["Row"],
    "storage_path" | "display_order"
  >[];
};

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string; month?: string; year?: string }>;
}) {
  const {
    destination: destinationSlug,
    month: monthParam,
    year: yearParam,
  } = await searchParams;
  const supabase = await createClient();

  // Both Month and Year must be present and individually valid for the date
  // filter to apply -- an invalid or half-set combination is silently
  // ignored (treated as if neither were given) rather than producing a
  // nonsensical partial filter or broken heading text.
  const monthNum = Number(monthParam);
  const yearNum = Number(yearParam);
  const hasDateFilter =
    Boolean(monthParam) &&
    Boolean(yearParam) &&
    Number.isInteger(monthNum) &&
    monthNum >= 1 &&
    monthNum <= 12 &&
    Number.isInteger(yearNum);
  const monthYearLabel = hasDateFilter
    ? `${MONTH_OPTIONS[monthNum - 1].label} ${yearNum}`
    : null;

  // Looked up separately (not derived from the packages join below) so the
  // heading still shows a real destination name even when zero packages
  // match -- an inner-joined query returns zero rows in that case, which
  // would otherwise leave destinationName with nothing to read from.
  let destinationName: string | null = null;
  if (destinationSlug) {
    const { data: destinationRow } = await supabase
      .from("destinations")
      .select("name")
      .eq("slug", destinationSlug)
      .eq("is_active", true)
      .maybeSingle();
    destinationName = destinationRow?.name ?? destinationSlug;
  }

  // destinations!inner / package_travel_dates!inner are required, not the
  // default to-one embed -- PostgREST only restricts which *parent* rows
  // come back when the embedded relation is an inner join; without !inner,
  // .eq()/.gte()/.lte() on an embedded column just nulls out non-matching
  // embeds instead of filtering the packages themselves. Both embeds are
  // only added to the select() when their filter is actually active, so an
  // unfiltered visit still gets the plain, cheaper query.
  //
  // .eq("destinations.is_active", true) is kept here even though RLS also
  // scopes anonymous visitors to is_active = true destinations, because RLS
  // grants authenticated can_manage_packages users read access to ALL
  // destinations -- without this query-layer filter, an admin browsing this
  // nominally public page would see packages for an inactive destination
  // that an anonymous visitor cannot, diverging from the destinationName
  // lookup above (which already filters is_active = true). Same
  // belt-and-suspenders reasoning as app/(public)/page.tsx's destinations
  // query.
  const selectParts = ["*", "package_photos(storage_path, display_order)"];
  if (destinationSlug) selectParts.push("destinations!inner(slug, name)");
  if (hasDateFilter)
    selectParts.push(
      "package_travel_dates!inner(travel_date_from, travel_date_to)"
    );

  let query = supabase
    .from("packages")
    .select(selectParts.join(", "))
    .eq("is_published", true);

  if (destinationSlug) {
    query = query
      .eq("destinations.slug", destinationSlug)
      .eq("destinations.is_active", true);
  }

  if (hasDateFilter) {
    const { from, to } = monthDateRange(yearNum, monthNum);
    query = query
      .gte("package_travel_dates.travel_date_from", from)
      .lte("package_travel_dates.travel_date_from", to);
  }

  const { data: packages, error } = await query.order("sort_order", {
    ascending: true,
  });

  if (error) {
    // Surfaced server-side only — the page still renders the empty state
    // below rather than crashing the whole route on a transient DB error.
    console.error("Failed to load packages:", error.message);
  }

  // select() is a dynamically built string (not a literal), so Supabase's
  // typed overloads fall back to a GenericStringError result type that
  // doesn't sufficiently overlap with PackageWithPhotos[] for a direct
  // cast -- `as unknown as` is this codebase's existing convention for that
  // exact situation (see app/admin/(dashboard)/crm/[id]/page.tsx:64).
  const rows = (packages ?? []) as unknown as PackageWithPhotos[];

  // A natural-language description of the active search, reused for the
  // heading, the empty-state copy, and the pre-filled inquiry message --
  // e.g. "a Palawan trip in August 2026", "a Palawan trip", "a trip in
  // August 2026", or null when no filter is active.
  const searchDescription =
    destinationName && monthYearLabel
      ? `a ${destinationName} trip in ${monthYearLabel}`
      : destinationName
        ? `a ${destinationName} trip`
        : monthYearLabel
          ? `a trip in ${monthYearLabel}`
          : null;
  const hasAnyFilter = Boolean(destinationSlug) || hasDateFilter;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {searchDescription
            ? `Packages for ${searchDescription}`
            : "Tour Packages"}
        </h1>
        <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
          Browse our tour packages and reach out on WhatsApp or Facebook to
          start planning your trip.
        </p>
        {hasAnyFilter ? (
          <Link
            href="/packages"
            className="w-fit text-sm text-primary underline underline-offset-2"
          >
            Clear filter
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <div className="flex flex-col gap-2 text-center">
            <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
              {searchDescription
                ? `No packages found for ${searchDescription}`
                : "No packages available right now"}
            </h2>
            <p className="text-base leading-[1.5] text-muted-foreground">
              {searchDescription
                ? "We don't have a ready-made package matching that search, but we'd love to build one for you — send us the details below."
                : "Check back soon, or send us a message below and we'll help you plan your trip."}
            </p>
          </div>
          <InquiryForm
            defaultMessage={
              searchDescription
                ? `I couldn't find ${searchDescription} — I'd like to ask about a custom itinerary.`
                : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((pkg) => {
            const [firstPhoto] = [...pkg.package_photos].sort(
              (a, b) => a.display_order - b.display_order
            );
            const photoUrl = firstPhoto
              ? getPublicImageUrl(firstPhoto.storage_path)
              : null;

            return <PackageCard key={pkg.id} pkg={pkg} photoUrl={photoUrl} />;
          })}
        </div>
      )}
    </div>
  );
}
