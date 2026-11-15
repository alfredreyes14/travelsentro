import {
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  ContactIcon,
  FileTextIcon,
  GlobeIcon,
  HandshakeIcon,
  LayoutTemplateIcon,
  MapPinIcon,
  PackageIcon,
  PlaneIcon,
  ReceiptTextIcon,
  TicketIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { can, isAdmin, type PermissionSubject } from "@/lib/auth/permissions";

/** The signed-in account; each link shows when it may read that module. */
export type AdminPermissions = PermissionSubject;

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  show: (p: AdminPermissions) => boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLink[];
};

export type NavSection = {
  /** Small caps label above the section; omitted for the first section. */
  label?: string;
  entries: (NavGroup | NavLink)[];
};

export function isNavGroup(entry: NavGroup | NavLink): entry is NavGroup {
  return "items" in entry;
}

// D-13: entries are hidden entirely (not disabled) without View permission
// for that module. Server-side enforcement still happens independently via
// requireModuleOrRedirect()/requireAdminOrRedirect() and RLS (AUTH-05).
export const ADMIN_NAV: NavSection[] = [
  {
    entries: [
      {
        id: "sales",
        label: "Sales",
        icon: BriefcaseBusinessIcon,
        items: [
          { href: "/admin/crm", label: "Leads", icon: ContactIcon, show: (p) => can(p, "leads", "read") },
          { href: "/admin/quotes", label: "Quotes", icon: FileTextIcon, show: (p) => can(p, "quotes", "read") },
          { href: "/admin/soa", label: "Statements (SOA)", icon: ReceiptTextIcon, show: (p) => can(p, "soa", "read") },
          { href: "/admin/vouchers", label: "Vouchers", icon: TicketIcon, show: (p) => can(p, "vouchers", "read") },
        ],
      },
      {
        id: "tours",
        label: "Tours",
        icon: PlaneIcon,
        items: [
          { href: "/admin/packages", label: "Packages", icon: PackageIcon, show: (p) => can(p, "packages", "read") },
          { href: "/admin/packages/destinations", label: "Destinations", icon: MapPinIcon, show: (p) => can(p, "destinations", "read") },
        ],
      },
      {
        id: "website",
        label: "Website",
        icon: GlobeIcon,
        items: [
          { href: "/admin/content", label: "Content", icon: LayoutTemplateIcon, show: (p) => can(p, "content", "read") },
          { href: "/admin/events", label: "Events", icon: CalendarDaysIcon, show: (p) => can(p, "events", "read") },
          { href: "/admin/partners", label: "Partners", icon: HandshakeIcon, show: (p) => can(p, "partners", "read") },
        ],
      },
    ],
  },
  {
    label: "Settings",
    entries: [
      { href: "/admin/users", label: "Users", icon: UsersIcon, show: (p) => isAdmin(p) },
    ],
  },
];

/** Every link in the nav, flattened, for active-route matching. */
export const ALL_NAV_LINKS: NavLink[] = ADMIN_NAV.flatMap((section) =>
  section.entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]))
);

/**
 * Longest-prefix match so a nested route (e.g. /admin/packages/destinations)
 * resolves to its own, more specific link instead of the parent Packages
 * link that also prefix-matches.
 */
export function findActiveLink(pathname: string): NavLink | undefined {
  return ALL_NAV_LINKS.filter(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

/** Applies permissions; drops groups and sections left with nothing visible. */
export function visibleNav(permissions: AdminPermissions): NavSection[] {
  return ADMIN_NAV.map((section) => ({
    ...section,
    entries: section.entries
      .map((entry) =>
        isNavGroup(entry)
          ? { ...entry, items: entry.items.filter((item) => item.show(permissions)) }
          : entry
      )
      .filter((entry) => (isNavGroup(entry) ? entry.items.length > 0 : entry.show(permissions))),
  })).filter((section) => section.entries.length > 0);
}
