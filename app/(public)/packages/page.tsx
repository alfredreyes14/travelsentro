import type { Metadata } from "next";
import Link from "next/link";
import { Mail, SearchX } from "lucide-react";
import { ViewTransition, cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { PackageCard } from "@/components/packages/package-card";
import { PackagesPagination } from "@/components/packages/pagination";
import { PackageSearch } from "@/components/packages/package-search";
import { SectionHeading } from "@/components/ui/section-heading";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { MONTH_OPTIONS } from "@/lib/months";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import type { Database } from "@/types/database";

const PAGE_SIZE = 6;
const MAX_QUERY_LENGTH = 100;

/** Escapes LIKE wildcards so a typed "%" or "_" matches literally. PostgREST
 * also treats "*" as a wildcard alias in like/ilike, so it's dropped. */
function toIlikePattern(query: string): string {
  const escaped = query.replace(/\*/g, "").replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

/** Wraps a value in double quotes for a PostgREST .or() filter string, so
 * user text containing commas/parens/dots can't break out of its condition.
 * Inside quotes PostgREST treats backslash as an escape for `"` and `\`. */
function quoteOrValue(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

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

const PACKAGES_DESCRIPTION =
  "Browse TravelSentro's tour packages across the Philippines and reach out on WhatsApp or Facebook to start planning your trip.";

type PackagesSearchParams = {
  destination?: string;
  month?: string;
  year?: string;
  page?: string;
  q?: string;
};

/** Normalizes the raw query string into the filters this page acts on --
 * shared by generateMetadata and the page so both agree on what counts as
 * an active filter. */
function parseFilters(params: PackagesSearchParams) {
  const { destination: destinationSlug, month: monthParam, year: yearParam } =
    params;

  // Blank/whitespace-only queries (e.g. submitting an empty search box) are
  // treated as no search at all.
  const query = params.q?.trim().slice(0, MAX_QUERY_LENGTH) || null;

  // An invalid/missing page (non-integer, < 1) silently falls back to page 1
  // rather than erroring — same "ignore, don't break" treatment as the
  // month/year filter below.
  const pageNum = (() => {
    const n = Number(params.page);
    return Number.isInteger(n) && n >= 1 ? n : 1;
  })();

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

  return {
    destinationSlug,
    monthParam,
    yearParam,
    pageNum,
    monthNum,
    yearNum,
    hasDateFilter,
    monthYearLabel,
    query,
    hasAnyFilter: Boolean(destinationSlug) || hasDateFilter || Boolean(query),
    // The search box is only offered on the plain /packages listing -- any
    // destination/month/year param (e.g. arriving from the homepage hero
    // search) hides it. Its own `q` and `page` params don't count, so the
    // box stays put while browsing search results.
    showSearch: !destinationSlug && !monthParam && !yearParam,
  };
}

// Looked up separately (not derived from the packages join) so the heading
// still shows a real destination name even when zero packages match -- an
// inner-joined query returns zero rows in that case, which would otherwise
// leave the name with nothing to read from. cache() dedupes the lookup
// between generateMetadata and the page within one request.
const getDestinationName = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: destinationRow } = await supabase
    .from("destinations")
    .select("name")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return destinationRow?.name ?? slug;
});

/** A natural-language description of the active search, e.g. "a Palawan
 * trip in August 2026", "a Palawan trip", "a trip in August 2026",
 * "“El Nido”", or null when no filter is active. */
function describeSearch(
  destinationName: string | null,
  monthYearLabel: string | null,
  query: string | null = null
): string | null {
  let base: string | null = null;
  if (destinationName && monthYearLabel)
    base = `a ${destinationName} trip in ${monthYearLabel}`;
  else if (destinationName) base = `a ${destinationName} trip`;
  else if (monthYearLabel) base = `a trip in ${monthYearLabel}`;
  if (!query) return base;
  return base ? `${base} matching “${query}”` : `“${query}”`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PackagesSearchParams>;
}): Promise<Metadata> {
  const { destinationSlug, monthYearLabel, query, pageNum, hasAnyFilter } =
    parseFilters(await searchParams);

  // Filtered views are internal search results -- an open-ended set of
  // query-string combinations that Google advises against indexing.
  // noindex,follow keeps the package links on them crawlable. No canonical
  // here: pairing noindex with a canonical to another URL sends Google
  // conflicting signals.
  if (hasAnyFilter) {
    const destinationName = destinationSlug
      ? await getDestinationName(destinationSlug)
      : null;
    const title = `Packages for ${describeSearch(destinationName, monthYearLabel, query)}`;
    return {
      ...buildPageMetadata({
        title,
        description: PACKAGES_DESCRIPTION,
        path: "/packages",
      }),
      alternates: undefined,
      robots: { index: false, follow: true },
    };
  }

  // Unfiltered pagination pages each canonicalize to themselves (Google's
  // guidance for paginated lists) rather than all pointing at page 1, which
  // would hide packages that only appear on later pages.
  return buildPageMetadata({
    title: pageNum > 1 ? `Tour Packages — Page ${pageNum}` : "Tour Packages",
    description: PACKAGES_DESCRIPTION,
    path: pageNum > 1 ? `/packages?page=${pageNum}` : "/packages",
  });
}

type PackageWithPhotos = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Pick<
    Database["public"]["Tables"]["package_photos"]["Row"],
    "storage_path" | "display_order"
  >[];
};

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<PackagesSearchParams>;
}) {
  const {
    destinationSlug,
    monthParam,
    yearParam,
    pageNum,
    monthNum,
    yearNum,
    hasDateFilter,
    monthYearLabel,
    query,
    hasAnyFilter,
    showSearch,
  } = parseFilters(await searchParams);
  const supabase = await createClient();

  const destinationName = destinationSlug
    ? await getDestinationName(destinationSlug)
    : null;

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

  let dbQuery = supabase
    .from("packages")
    .select(selectParts.join(", "), { count: "exact" })
    .eq("is_published", true);

  if (destinationSlug) {
    dbQuery = dbQuery
      .eq("destinations.slug", destinationSlug)
      .eq("destinations.is_active", true);
  }

  if (hasDateFilter) {
    const { from, to } = monthDateRange(yearNum, monthNum);
    dbQuery = dbQuery
      .gte("package_travel_dates.travel_date_from", from)
      .lte("package_travel_dates.travel_date_from", to);
  }

  if (query) {
    const pattern = toIlikePattern(query);

    // PostgREST can't OR a parent column with an embedded table's column in
    // one filter, so matching destinations are resolved to ids first and the
    // package filter becomes "name matches OR destination is one of these".
    // is_active = true for the same reason as the destination filter above.
    const { data: matchingDestinations } = await supabase
      .from("destinations")
      .select("id")
      .ilike("name", pattern)
      .eq("is_active", true);
    const destinationIds = (matchingDestinations ?? []).map((d) => d.id);

    const conditions = [`name.ilike.${quoteOrValue(pattern)}`];
    if (destinationIds.length > 0)
      conditions.push(`destination_id.in.(${destinationIds.join(",")})`);
    dbQuery = dbQuery.or(conditions.join(","));
  }

  // Featured packages lead, then newest first. (The admin panel no longer
  // exposes manual drag-ordering, so `sort_order` is no longer authored.)
  const { data: packages, error, count } = await dbQuery
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1);

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

  // Reused for the heading, the empty-state copy, and the pre-filled
  // inquiry message.
  const searchDescription = describeSearch(
    destinationName,
    monthYearLabel,
    query
  );
  const totalPages = Math.max(Math.ceil((count ?? 0) / PAGE_SIZE), 1);

  // Preserves the active destination/month/year/search filters across page links —
  // `page` is only included once it's not the default, so page-1 URLs stay
  // clean (matches how `/packages` with no filters has no query string).
  function buildPageHref(page: number): string {
    const params = new URLSearchParams();
    if (destinationSlug) params.set("destination", destinationSlug);
    if (monthParam) params.set("month", monthParam);
    if (yearParam) params.set("year", yearParam);
    if (query) params.set("q", query);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/packages?${qs}` : "/packages";
  }

  return (
    <ViewTransition enter="slide-up" default="none">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
        {/* Heading left, search right on desktop; stacked on mobile. The
            search's lg:ml-auto keeps it right-aligned even when the heading
            is hidden (empty results). */}
        {rows.length > 0 || showSearch ? (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            {rows.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
                  {searchDescription
                    ? `Packages for ${searchDescription}`
                    : "Tour Packages"}
                </h1>
                <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
                  Browse our tour packages and reach out on WhatsApp or Facebook
                  to start planning your trip.
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
            ) : null}

            {showSearch ? (
              <PackageSearch
                defaultQuery={query ?? undefined}
                className="lg:ml-auto lg:max-w-md lg:shrink-0"
              />
            ) : null}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <SearchX className="size-7" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-2">
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
            </div>

            <InquiryForm
              key={searchDescription ?? "all"}
              heading={
                <SectionHeading icon={Mail}>Send us the details</SectionHeading>
              }
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

        {rows.length > 0 ? (
          <PackagesPagination
            currentPage={pageNum}
            totalPages={totalPages}
            buildHref={buildPageHref}
          />
        ) : null}
      </div>
    </ViewTransition>
  );
}
