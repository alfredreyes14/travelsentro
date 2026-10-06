import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  SITE_URL,
} from "@/lib/constants";
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";
import { BASE_OPEN_GRAPH, SITE_NAME } from "@/lib/seo/page-metadata";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const DEFAULT_TITLE = "TravelSentro | Philippines Tour Packages";
const DEFAULT_DESCRIPTION =
  "Browse TravelSentro tour packages and reach out via WhatsApp, Facebook, or our inquiry form.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | TravelSentro",
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

// TravelAgency structured data (https://schema.org/TravelAgency) — one
// business-level entity for the whole site, rendered once in the root
// layout rather than per-page. Package pages add their own TouristTrip
// JSON-LD on top of this. TravelAgency is a LocalBusiness subtype, so the
// address/telephone fields are what make it eligible for local search
// signals; addressLocality/Region are split out of CONTACT_ADDRESS by hand
// since that constant is a single display string.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "TravelAgency",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  image: `${SITE_URL}/logo.png`,
  email: CONTACT_EMAIL,
  telephone: `+${WHATSAPP_NUMBER}`,
  address: {
    "@type": "PostalAddress",
    streetAddress: CONTACT_ADDRESS,
    addressLocality: "Taguig City",
    addressRegion: "Metro Manila",
    addressCountry: "PH",
  },
  sameAs: [FACEBOOK_URL, INSTAGRAM_URL],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
