import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import type { Database } from "@/types/database";

type PackageRow = Database["public"]["Tables"]["packages"]["Row"];

/**
 * List card: photo, name, "From ₱X" badge, "Featured" badge, icon-only
 * WhatsApp/Facebook CTAs. The whole card links to the package detail page
 * (`/packages/[slug]`, built in 01-06) via the "stretched link" pattern —
 * the title's <Link> covers the full card via an absolutely-positioned
 * pseudo-element (`after:absolute after:inset-0`) so the card is clickable
 * everywhere, while the CTA <a> elements stay independently clickable
 * (raised above the stretched link with `relative z-10`) without nesting
 * anchors, which is invalid HTML.
 */
export function PackageCard({
  pkg,
  photoUrl,
}: {
  pkg: PackageRow;
  photoUrl: string | null;
}) {
  return (
    <Card className="relative gap-0 overflow-hidden p-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary/10">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={pkg.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No photo available
          </div>
        )}
        {pkg.is_featured && (
          <Badge className="absolute top-3 left-3">Featured</Badge>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
          <Link
            href={`/packages/${pkg.slug}`}
            className="static after:absolute after:inset-0"
          >
            {pkg.name}
          </Link>
        </h3>

        <Badge className="w-fit">
          From ₱{pkg.from_price.toLocaleString("en-PH")}
        </Badge>

        <div className="flex items-center gap-2">
          <WhatsAppCta packageName={pkg.name} variant="icon-only" />
          <FacebookCta variant="icon-only" />
        </div>
      </div>
    </Card>
  );
}
