"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PackageIcon,
  ContactIcon,
  UsersIcon,
  LayoutTemplateIcon,
  MapPinIcon,
} from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
};

export function AdminNav({
  canManagePackages,
  canManageUsers,
}: {
  canManagePackages: boolean;
  canManageUsers: boolean;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    // D-13: hidden entirely (not disabled) when the permission is absent.
    // Server-side enforcement still happens independently via
    // requirePermission()/requireAdmin() (AUTH-05).
    {
      href: "/admin/packages",
      label: "Packages",
      icon: PackageIcon,
      show: canManagePackages,
    },
    // T-06-21: reuses the identical canManagePackages boolean as Packages
    // above -- no new permission toggle. Server-side enforcement still
    // happens independently via requirePermissionOrRedirect() (AUTH-05).
    {
      href: "/admin/content",
      label: "Content",
      icon: LayoutTemplateIcon,
      show: canManagePackages,
    },
    {
      href: "/admin/packages/destinations",
      label: "Destinations",
      icon: MapPinIcon,
      show: canManagePackages,
    },
    // CRM-03: universal read -- every authenticated Admin/Staff sees
    // "Contacts" regardless of can_edit_crm, deliberately NOT
    // permission-gated (unlike Packages/Content/Destinations/Users).
    {
      href: "/admin/crm",
      label: "Contacts",
      icon: ContactIcon,
      show: true,
    },
    {
      href: "/admin/users",
      label: "Users",
      icon: UsersIcon,
      show: canManageUsers,
    },
  ];

  // Longest-prefix match so a nested route (e.g. /admin/packages/destinations)
  // highlights its own, more specific nav item instead of the parent
  // Packages item both prefix-match.
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items
            .filter((item) => item.show)
            .map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  size="lg"
                  isActive={item.href === activeHref}
                  tooltip={item.label}
                  render={<Link href={item.href} />}
                >
                  <item.icon className="size-5" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {item.label}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
