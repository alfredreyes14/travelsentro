"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/packages", label: "Packages" },
  { href: "/contact", label: "Contact Us" },
];

/**
 * Sticky, solid-white public site header. Desktop shows an inline nav;
 * below `md` the links collapse behind a burger button that opens the
 * shared shadcn Sheet as a right-side drawer (sticky, not fixed, so it
 * never needs a body padding-top offset).
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-3 sm:px-4">
        <Link href="/" className="shrink-0 opacity-100 transition-opacity hover:opacity-80">
          <Image
            src="/logo.png"
            alt="TravelSentro — Built for Agencies. Ready for Travelers."
            width={873}
            height={241}
            priority
            className="h-14 w-auto sm:h-16"
          />
        </Link>

        <nav aria-label="Main navigation" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm font-medium">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "border-b-2 border-transparent py-5 text-secondary/70 transition-colors hover:text-primary",
                      active && "border-primary text-primary"
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:hidden"
                aria-label="Open menu"
              />
            }
          >
            <MenuIcon className="size-6" />
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetClose
                nativeButton={false}
                render={<Link href="/" aria-label="TravelSentro home" />}
                className="w-fit"
              >
                <Image
                  src="/logo.png"
                  alt="TravelSentro — Built for Agencies. Ready for Travelers."
                  width={873}
                  height={241}
                  className="h-10 w-auto"
                />
              </SheetClose>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <SheetClose
                    key={link.href}
                    nativeButton={false}
                    render={
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                    className={cn(
                      "flex min-h-11 items-center rounded-md px-3 text-base font-medium text-secondary transition-colors hover:bg-muted",
                      active && "bg-muted text-primary"
                    )}
                  >
                    {link.label}
                  </SheetClose>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
