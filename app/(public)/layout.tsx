import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import {
  buildWhatsAppLink,
  formatWhatsAppNumberForDisplay,
  WHATSAPP_NUMBER,
} from "@/lib/whatsapp";
import { buildMessengerLink } from "@/lib/messenger/link";
import { CONTACT_EMAIL, CONTACT_ADDRESS, INSTAGRAM_URL } from "@/lib/constants";

const FOOTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/packages", label: "Packages" },
  { href: "/contact", label: "Contact Us" },
  { href: "/privacy-policy", label: "Privacy Policy" },
];

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Reveal (components/motion/reveal.tsx) and FadeImage/FadeImg
          (components/motion/fade-image.tsx) both start content at
          opacity-0 until client-side JS (an IntersectionObserver, or an
          image load event) confirms it's ready -- that initial hidden
          state is baked into the server-rendered HTML, so a visitor
          without JavaScript would otherwise never see it revealed. This
          forces both visible whenever scripting is off. */}
      <noscript>
        <style>{`.reveal, .fade-image { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to main content
      </a>

      <SiteHeader />

      <main id="main-content" className="flex-1 bg-background">
        {children}
      </main>

      <footer className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <p className="font-heading text-lg font-semibold">
                TravelSentro
              </p>
              <p className="text-sm text-primary-foreground/80">
                Built for Agencies. Ready for Travelers.
              </p>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <p className="font-heading font-semibold">Quick Links</p>
              <nav aria-label="Footer navigation">
                <ul className="flex flex-col gap-2">
                  {FOOTER_LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <p className="font-heading font-semibold">Get in Touch</p>
              <a
                href={`tel:+${WHATSAPP_NUMBER}`}
                className="w-fit text-primary-foreground/80 transition-colors hover:text-primary-foreground"
              >
                {formatWhatsAppNumberForDisplay()}
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="w-fit text-primary-foreground/80 transition-colors hover:text-primary-foreground"
              >
                {CONTACT_EMAIL}
              </a>
              <p className="text-primary-foreground/80">{CONTACT_ADDRESS}</p>
              <div className="flex items-center gap-4 pt-1">
                <a
                  href={buildWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message us on WhatsApp"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 448 512"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                </a>
                <a
                  href={buildMessengerLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message us on Facebook"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.459h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.438-4.92 8.438-9.94Z" />
                  </svg>
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow us on Instagram"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 448 512"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z" />
                  </svg>
                </a>
                <a
                  href={`viber://chat?number=%2B${WHATSAPP_NUMBER}`}
                  aria-label="Message us on Viber"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-6"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-primary-foreground/20 pt-6 text-sm text-primary-foreground/70">
            &copy; {new Date().getFullYear()} TravelSentro. All rights
            reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
