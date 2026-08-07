"use client";

import Image from "next/image";
import Link from "next/link";
import { PanelLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

/**
 * Sidebar's own header: brand mark + the sidebar's collapse/expand toggle
 * (moved here from the top bar so the control that shrinks the sidebar
 * lives on the sidebar itself). Swaps between the full public-site
 * lockup and the compact icon mark via the `group-data-[collapsible=icon]`
 * selector set by the ancestor <Sidebar> — pure CSS, no JS state needed for
 * the swap itself. Only matches on the desktop icon-collapse tree, so the
 * mobile sheet always renders the expanded (full-logo, row) layout.
 */
export function AdminSidebarHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-2">
      <Link
        href="/admin/crm"
        aria-label="TravelSentro admin home"
        className="flex min-w-0 items-center opacity-100 transition-opacity hover:opacity-80 group-data-[collapsible=icon]:hidden"
      >
        <Image
          src="/logo.png"
          alt="TravelSentro — Built for Agencies. Ready for Travelers."
          width={873}
          height={241}
          className="h-10 w-auto"
          priority
        />
      </Link>
      <Link
        href="/admin/crm"
        aria-label="TravelSentro admin home"
        className="hidden items-center opacity-100 transition-opacity hover:opacity-80 group-data-[collapsible=icon]:flex"
      >
        <Image
          src="/icon-no-bg.png"
          alt="TravelSentro"
          width={643}
          height={591}
          className="size-8"
          priority
        />
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <PanelLeftIcon className="size-4" />
      </Button>
    </div>
  );
}
