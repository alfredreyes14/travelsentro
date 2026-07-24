import type { Metadata } from "next";

import { verifyContactId } from "@/lib/unsubscribe-token";
import { createClient } from "@/lib/supabase/server";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { FACEBOOK_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Unsubscribe | TravelSentro",
};

/**
 * Public, unauthenticated Server Component (MSG-05, T-04-14) -- placed at
 * app/unsubscribe/page.tsx, OUTSIDE the (public) route group, so it inherits
 * ONLY the root layout's fonts/Toaster/TooltipProvider, with no site
 * header/nav/footer and no admin chrome. verifyContactId() (04-02's HMAC
 * pair) is checked BEFORE any Supabase call -- an invalid/missing/tampered
 * signature never reaches set_contact_opted_out(), closing Pitfall 5.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string; sig?: string }>;
}) {
  const { cid, sig } = await searchParams;

  const isValid = Boolean(cid && sig && verifyContactId(cid, sig));

  if (isValid) {
    const supabase = await createClient();
    await supabase.rpc("set_contact_opted_out", { p_contact_id: cid });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
        {isValid ? (
          <>
            <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
              You&apos;ve been unsubscribed
            </h1>
            <p className="text-base leading-[1.5] text-muted-foreground">
              You won&apos;t receive any more bulk emails or texts from
              TravelSentro. If you have questions about an existing booking,
              message us on WhatsApp or Facebook anytime.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
              This link isn&apos;t valid
            </h1>
            <p className="text-base leading-[1.5] text-muted-foreground">
              This unsubscribe link may be broken. If you&apos;d like to stop
              receiving messages, message us on WhatsApp or Facebook and
              we&apos;ll take care of it.
            </p>
          </>
        )}
        <div className="flex items-center gap-4">
          <a
            href={buildWhatsAppLink("my trip")}
            className="text-primary hover:underline"
          >
            WhatsApp
          </a>
          <a href={FACEBOOK_URL} className="text-primary hover:underline">
            Facebook
          </a>
        </div>
      </div>
    </main>
  );
}
