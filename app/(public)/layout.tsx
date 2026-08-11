import { SiteHeader } from "@/components/layout/site-header";

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
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm sm:px-8">
          <p className="font-heading font-semibold">TravelSentro</p>
          <p>
            &copy; {new Date().getFullYear()} TravelSentro. All rights
            reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
