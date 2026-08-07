import { MapPinned, BadgePercent, MessageCircleHeart, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const VALUE_PROPS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: MapPinned,
    title: "Local Expertise",
    description:
      "Philippines-based and Philippines-focused -- we know the islands, the routes, and the best times to go.",
  },
  {
    icon: BadgePercent,
    title: "Best Value",
    description:
      "Carefully curated packages that balance price and experience, with no hidden fees.",
  },
  {
    icon: MessageCircleHeart,
    title: "Personalized Service",
    description:
      "Reach us directly on WhatsApp or Facebook and get a real answer from a real person, fast.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted by Travelers",
    description:
      "An established travel business with years of happy customers across the Philippines and beyond.",
  },
];

/** Homepage "Why Choose Us" section -- static content, no admin management. */
export function WhyChooseUs() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 sm:px-8">
      <div className="flex flex-col gap-2 sm:max-w-2xl">
        <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
          The TravelSentro Difference
        </span>
        <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Why Choose Us
        </h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          What travelers get every time they book with us.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 sm:divide-y-0 lg:grid-cols-4">
        {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex flex-col gap-3 py-8 first:pt-0 sm:py-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-6 text-primary" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
              {title}
            </h3>
            <p className="text-base leading-[1.5] text-muted-foreground">
              {description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
