import { Card } from "@/components/ui/card";

export type ValuePropDisplay = {
  id: string;
  title: string;
  description: string;
};

/**
 * Homepage "Why Choose Us" section — pure prop-driven, zero Supabase
 * awareness. Returns null on an empty array per UI-SPEC's public homepage
 * empty-state rule (no placeholder/"coming soon" copy).
 */
export function WhyChooseUs({ valueProps }: { valueProps: ValuePropDisplay[] }) {
  if (valueProps.length === 0) return null;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
      <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
        Why Choose Us
      </h2>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {valueProps.map((valueProp) => (
          <Card key={valueProp.id} className="p-4">
            <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
              {valueProp.title}
            </h3>
            <p className="text-base leading-[1.5] text-muted-foreground">
              {valueProp.description}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
