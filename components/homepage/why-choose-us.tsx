import { ClipboardList, Headset, MessagesSquare, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const VALUE_PROPS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: ClipboardList,
    title: "Clear package information",
    description:
      "Inclusions, travel dates, surcharges, and key conditions are presented for easier decisions.",
  },
  {
    icon: Headset,
    title: "Responsive human support",
    description:
      "Customers receive guided assistance rather than navigating booking details alone.",
  },
  {
    icon: MessagesSquare,
    title: "Social-first convenience",
    description:
      "Inquiries and lead qualification can happen through Facebook, Instagram, and Messenger.",
  },
  {
    icon: SlidersHorizontal,
    title: "Flexible travel solutions",
    description:
      "Options for leisure, group, corporate, and agency-partner requirements.",
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
        <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
          Why TravelSentro
        </h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          What travelers get every time they inquire with us.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 sm:divide-y-0 lg:grid-cols-4">
        {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex flex-col gap-3 py-8 first:pt-0 sm:py-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-6 text-primary" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="font-heading text-[20px] leading-[1.2] font-semibold text-secondary">
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
