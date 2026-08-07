import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import type { Database } from "@/types/database";

type PackageRow = Database["public"]["Tables"]["packages"]["Row"];

/**
 * Immersive overlay card: full-bleed photo with name, duration, "₱X / pax"
 * badge, and icon-only WhatsApp/Facebook CTAs sitting on a bottom gradient
 * scrim instead of a separate white panel.
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
  return (
    <Card className="relative grid aspect-[4/5] overflow-hidden p-0 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={pkg.name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="col-start-1 row-start-1 object-cover transition-transform duration-300 ease-out motion-reduce:transition-none group-hover/card:scale-105"
        />
      ) : (
        <div className="col-start-1 row-start-1 flex items-center justify-center bg-secondary/10 text-sm text-muted-foreground">
          No photo available
        </div>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none relative col-start-1 row-start-1 bg-gradient-to-t from-black/90 via-black/10 to-transparent"
      />

      <Link
        href={`/packages/${pkg.slug}`}
        aria-label={pkg.name}
        className="relative col-start-1 row-start-1"
      />

      {pkg.is_featured && (
        <Badge className="pointer-events-none relative col-start-1 row-start-1 m-3 self-start justify-self-start shadow-sm">
          Featured
        </Badge>
      )}

      <div className="pointer-events-none relative col-start-1 row-start-1 flex flex-col justify-end gap-1 p-4">
        <p className="truncate text-xs font-medium tracking-wide text-white/80 text-shadow-sm uppercase">
          {pkg.duration_label ?? "Duration TBA"}
        </p>

        <h3 className="line-clamp-2 font-heading text-[20px] leading-[1.2] font-semibold text-white text-shadow-sm">
          {pkg.name}
        </h3>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            {pkg.discount_amount ? (
              <span className="text-xs text-white/70 text-shadow-sm line-through">
                ₱{pkg.price_per_pax.toLocaleString("en-PH")}
              </span>
            ) : null}
            <Badge>
              ₱
              {(
                pkg.price_per_pax - (pkg.discount_amount ?? 0)
              ).toLocaleString("en-PH")}{" "}
              / pax
            </Badge>
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <WhatsAppCta packageName={pkg.name} variant="icon-only" />
            <FacebookCta packageName={pkg.name} variant="icon-only" />
          </div>
        </div>
      </div>
    </Card>
  );
}
