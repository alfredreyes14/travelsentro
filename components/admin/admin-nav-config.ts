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

export type AdminPermissions = {
  canManagePackages: boolean;
  canManageUsers: boolean;
  canManageVouchers: boolean;
  canManageQuotes: boolean;
};

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

// D-13: entries are hidden entirely (not disabled) when the permission is
// absent. Server-side enforcement still happens independently via
// requirePermission()/requireAdmin() (AUTH-05).
export const ADMIN_NAV: NavSection[] = [
  {
    entries: [
      {
        id: "sales",
        label: "Sales",
        icon: BriefcaseBusinessIcon,
        items: [
          // CRM-03: universal read -- every authenticated Admin/Staff sees
          // "Leads" regardless of can_edit_crm, deliberately NOT gated.
          { href: "/admin/crm", label: "Leads", icon: ContactIcon, show: () => true },
          { href: "/admin/quotes", label: "Quotes", icon: FileTextIcon, show: (p) => p.canManageQuotes },
          // Statements of Account share the Quotes permission -- no new toggle.
          { href: "/admin/soa", label: "Statements (SOA)", icon: ReceiptTextIcon, show: (p) => p.canManageQuotes },
          { href: "/admin/vouchers", label: "Vouchers", icon: TicketIcon, show: (p) => p.canManageVouchers },
        ],
      },
      {
        id: "tours",
        label: "Tours",
        icon: PlaneIcon,
        items: [
          { href: "/admin/packages", label: "Packages", icon: PackageIcon, show: (p) => p.canManagePackages },
          { href: "/admin/packages/destinations", label: "Destinations", icon: MapPinIcon, show: (p) => p.canManagePackages },
        ],
      },
      {
        id: "website",
        label: "Website",
        icon: GlobeIcon,
        // T-06-21: Content, Events and Partners all reuse canManagePackages
        // -- no new permission toggle.
        items: [
          { href: "/admin/content", label: "Content", icon: LayoutTemplateIcon, show: (p) => p.canManagePackages },
          { href: "/admin/events", label: "Events", icon: CalendarDaysIcon, show: (p) => p.canManagePackages },
          { href: "/admin/partners", label: "Partners", icon: HandshakeIcon, show: (p) => p.canManagePackages },
        ],
      },
    ],
  },
  {
    label: "Settings",
    entries: [
      { href: "/admin/users", label: "Users", icon: UsersIcon, show: (p) => p.canManageUsers },
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
