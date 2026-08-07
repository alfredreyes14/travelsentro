"use client";

import { usePathname } from "next/navigation";
import { LogOutIcon, MenuIcon } from "lucide-react";

import { logout } from "@/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const SECTION_LABELS: { prefix: string; label: string }[] = [
  // Most specific prefix first so nested routes (e.g. the Destinations
  // sub-route under /admin/packages) resolve to their own label instead of
  // the parent section's.
  { prefix: "/admin/packages/destinations", label: "Destinations" },
  { prefix: "/admin/packages", label: "Packages" },
  { prefix: "/admin/content", label: "Content" },
  { prefix: "/admin/crm", label: "Contacts" },
  { prefix: "/admin/users", label: "Users" },
];

function getSectionLabel(pathname: string) {
  return SECTION_LABELS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )?.label;
}

function getInitials(name: string | null, email: string) {
  const source = (name?.trim() || email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Persistent white top bar. The burger + current-section label are mobile
 * only: on desktop the sidebar's own header carries the collapse toggle and
 * its expanded nav already shows the active section, so repeating that
 * here would be redundant — on mobile the sidebar is a closed drawer by
 * default, so both are the only on-screen orientation/navigation cues. The
 * profile badge always stays visible on the right, on every screen size.
 */
export function AdminTopbar({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const sectionLabel = getSectionLabel(pathname);
  const initials = getInitials(name, email);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-secondary hover:bg-muted hover:text-secondary md:hidden"
        onClick={toggleSidebar}
        aria-label="Open navigation menu"
      >
        <MenuIcon className="size-5" />
      </Button>
      {sectionLabel ? (
        <>
          <Separator orientation="vertical" className="h-6 md:hidden" />
          <span className="font-heading text-sm font-semibold text-secondary md:hidden">
            {sectionLabel}
          </span>
        </>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Account menu"
              className="ml-auto flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <Avatar>
            <AvatarFallback className="bg-secondary font-medium text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
              <span className="truncate text-sm font-medium text-foreground">
                {name ?? email}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => logout()}>
            <LogOutIcon />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
