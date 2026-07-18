import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/packages", label: "Packages" },
  { href: "/contact", label: "Contact Us" },
];

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <Link href="/" className="font-heading text-lg font-semibold">
            TravelSentro
          </Link>
          <nav aria-label="Main navigation">
            <ul className="flex flex-wrap items-center gap-6 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex-1 bg-background">{children}</main>

      <footer className="bg-secondary text-secondary-foreground">
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
