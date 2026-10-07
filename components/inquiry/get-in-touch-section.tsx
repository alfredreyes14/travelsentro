import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

/**
 * "Get in Touch" block -- WhatsApp/Facebook CTAs plus the inquiry form.
 * Shared by the homepage and the FAQ page so both stay identical.
 */
export function GetInTouchSection() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 sm:px-8">
      <div className="flex flex-col gap-2">
        <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
          We&apos;d Love to Hear From You
        </span>
        <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
          Get in Touch
        </h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Message us directly for a fast reply, or send the details below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <WhatsAppCta variant="icon-label" />
        <FacebookCta variant="icon-label" />
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or send us a message
        <div className="h-px flex-1 bg-border" />
      </div>

      <InquiryForm />
    </section>
  );
}
