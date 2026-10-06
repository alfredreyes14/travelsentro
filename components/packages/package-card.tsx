import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FadeImage } from "@/components/motion/fade-image";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import { formatPackagePrice } from "@/lib/packages/format-price";
import { packagePath } from "@/lib/packages/package-url";
import type { Database } from "@/types/database";

type PackageRow = Database["public"]["Tables"]["packages"]["Row"];

/**
 * Immersive overlay card: full-bleed photo with name, duration, "₱X / pax"
 * badge, and icon-only WhatsApp/Facebook CTAs sitting over the photo instead
 * of a separate white panel. A permanent bottom scrim (fading out by ~55%
 * of the card height) keeps the text legible over bright photos (beaches,
 * skies, snow) — including on mobile where there's no hover — and a deeper
 * scrim fades in on hover (matching the destinations tiles' hover
 * treatment). The strikethrough original price sits in its own dark chip
 * since small, thin text can't rely on the scrim alone.
 *
 * The photo, scrim, badge, and text layers are stacked via the CSS "grid
 * stack" technique (every layer shares `col-start-1 row-start-1` inside a
 * `grid` Card). next/image's `fill` prop renders the <img> itself as
 * `position: absolute` internally, and a positioned element always paints
 * above `position: static` siblings regardless of DOM order — so every
 * layer that must appear above the photo (scrim, badge, text block) is
 * also explicitly `relative`, ordered by DOM position (later = on top).
 * The scrim and badge are `pointer-events-none` (purely visual, nothing to
 * click), and the text block is `pointer-events-none` with the CTA row
 * opted back in via `pointer-events-auto`, so clicks fall through to the
 * layer beneath them.
 *
 * The whole-card click target is a dedicated invisible <Link> (its own
 * positioned layer, placed right after the photo) rather than a
 * pseudo-element hung off the visible title text — the title renders as
 * plain (non-interactive) text. Decoupling the click target from the
 * title sidesteps the "nearest positioned ancestor" trap of the
 * after:absolute after:inset-0 pattern, where any positioned wrapper
 * between the Link and Card would shrink the click area to that
 * wrapper's box instead of the full card. The CTA <a> elements stay
 * independently clickable (raised above the stretched link with
 * `relative z-10`).
 */
export function PackageCard({
  pkg,
  photoUrl,
}: {
  pkg: PackageRow;
  photoUrl: string | null;
}) {
  const price = formatPackagePrice(pkg.price_per_pax, pkg.discount_amount);

  return (
    <Card className="group/card relative grid aspect-[4/5] overflow-hidden p-0 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      {photoUrl ? (
        <FadeImage
          src={photoUrl}
          alt={pkg.name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="col-start-1 row-start-1 transform-gpu object-cover duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:scale-105"
        />
      ) : (
        <div className="col-start-1 row-start-1 flex items-center justify-center bg-secondary/10 text-sm text-muted-foreground">
          No photo available
        </div>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none relative col-start-1 row-start-1 bg-gradient-to-t from-black/75 from-0% via-black/35 via-30% to-transparent to-55%"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none relative col-start-1 row-start-1 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:opacity-100"
      />

      <Link
        href={packagePath(pkg)}
        aria-label={pkg.name}
        className="relative col-start-1 row-start-1"
      />

      {pkg.is_featured && (
        <Badge
          variant="secondary"
          className="pointer-events-none relative col-start-1 row-start-1 m-3 h-auto self-start justify-self-start px-3 py-1 text-sm font-semibold shadow-md"
        >
          Featured
        </Badge>
      )}

      <div className="pointer-events-none relative col-start-1 row-start-1 flex flex-col justify-end gap-1 p-4">
        <p className="truncate text-xs font-semibold tracking-wide text-white/90 text-shadow-md text-shadow-black/50 uppercase">
          {pkg.duration_label ?? "Duration TBA"}
        </p>

        <h3 className="line-clamp-2 font-heading text-[20px] leading-[1.2] font-semibold text-white text-shadow-md text-shadow-black/50">
          {pkg.name}
        </h3>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            {price.original ? (
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white/90 line-through decoration-white/80 backdrop-blur-sm">
                {price.original}
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className="h-auto px-3 py-1 text-sm font-semibold shadow-md"
            >
              {price.final}
            </Badge>
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <WhatsAppCta packageName={pkg.name} variant="icon-only" />
            <FacebookCta
              packageName={pkg.name}
              packageSlug={pkg.slug}
              variant="icon-only"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
