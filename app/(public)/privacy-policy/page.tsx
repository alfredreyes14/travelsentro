import type { Metadata } from "next";
import { CONTACT_EMAIL, CONTACT_ADDRESS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy | TravelSentro",
  description:
    "How TravelSentro collects, uses, and protects your information when you browse our site or reach out about a tour package.",
};

const LAST_UPDATED = "August 16, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>
      </div>

      <div className="flex flex-col gap-6 text-base leading-[1.6] text-muted-foreground">
        <p>
          This Privacy Policy explains how TravelSentro (&quot;we&quot;,
          &quot;us&quot;) collects, uses, and protects your information when
          you browse travelsentro.com or reach out to us about a tour
          package.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Information we collect
          </h2>
          <p>
            We collect the information you choose to give us when you inquire
            about a package — through our inquiry form, WhatsApp, or
            Facebook/Messenger. This typically includes your name, email
            address, phone number, and the details of your travel inquiry
            (destination, dates, number of travelers, and any message you
            send us).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            How we use your information
          </h2>
          <ul className="list-disc pl-5 [&>li]:mt-2">
            <li>To respond to your inquiry and help plan your trip.</li>
            <li>
              To keep a record of your inquiry in our customer relationship
              management (CRM) system so our team can follow up with you.
            </li>
            <li>
              To send you email or SMS updates related to your inquiry or
              booking, and — only if you haven&apos;t opted out — occasional
              follow-ups about offers that may interest you.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Who we share it with
          </h2>
          <p>
            We don&apos;t sell your information. We share it only with the
            service providers that let us run the business — our database
            and hosting provider, our email and SMS delivery providers, and
            Meta (for WhatsApp/Messenger conversations you start with us) —
            each of whom processes it only on our behalf.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Your choices
          </h2>
          <p>
            You can ask us to update or delete your information, or opt out
            of email/SMS follow-ups, at any time by contacting us using the
            details below. Marketing emails also include an unsubscribe
            link.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Contact us
          </h2>
          <p>
            If you have questions about this policy or how we handle your
            information, reach us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            or at {CONTACT_ADDRESS}.
          </p>
        </section>
      </div>
    </div>
  );
}
