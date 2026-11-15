"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useNavigationGuard } from "./navigation-guard";
import {
  findActiveLink,
  isNavGroup,
  visibleNav,
  type AdminPermissions,
  type NavGroup,
  type NavLink,
} from "./admin-nav-config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

/** Shared row styling for top-level buttons (groups and standalone links). */
const ROW_CLASS =
  "h-10 gap-3 px-3 font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground [&_svg]:size-[18px]";

/**
 * Client-side navigation never reaches beforeunload, so unfinished work is
 * confirmed here instead.
 */
function useGuardedNavigate() {
  const router = useRouter();
  const { isBlocked, runGuarded } = useNavigationGuard();
  return (href: string) => (event: { preventDefault: () => void }) => {
    if (!isBlocked) return;
    event.preventDefault();
    runGuarded(() => router.push(href));
  };
}

export function AdminNav(permissions: AdminPermissions) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const iconOnly = state === "collapsed" && !isMobile;

  const sections = visibleNav(permissions);
  const activeHref = findActiveLink(pathname)?.href;
  const activeGroupId = sections
    .flatMap((s) => s.entries)
    .filter(isNavGroup)
    .find((g) => g.items.some((i) => i.href === activeHref))?.id;

  // The group holding the current route starts open; the rest start closed.
  // When the route moves into a different group, that group opens too
  // (state adjusted during render rather than in an effect).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    activeGroupId ? { [activeGroupId]: true } : {}
  );
  const [lastActiveGroupId, setLastActiveGroupId] = useState(activeGroupId);
  if (activeGroupId !== lastActiveGroupId) {
    setLastActiveGroupId(activeGroupId);
    if (activeGroupId && !openGroups[activeGroupId]) {
      setOpenGroups((prev) => ({ ...prev, [activeGroupId]: true }));
    }
  }

  return (
    <>
      {sections.map((section, index) => (
        <SidebarGroup
          key={section.label ?? index}
          className="px-3 py-2 group-data-[collapsible=icon]:px-1"
        >
          {section.label ? (
            <SidebarGroupLabel className="h-7 px-3 text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
              {section.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {section.entries.map((entry) =>
                isNavGroup(entry) ? (
                  iconOnly ? (
                    <GroupFlyout
                      key={entry.id}
                      group={entry}
                      activeHref={activeHref}
                    />
                  ) : (
                    <GroupCollapsible
                      key={entry.id}
                      group={entry}
                      activeHref={activeHref}
                      open={!!openGroups[entry.id]}
                      onOpenChange={(open) =>
                        setOpenGroups((prev) => ({ ...prev, [entry.id]: open }))
                      }
                    />
                  )
                ) : (
                  <StandaloneLink
                    key={entry.href}
                    link={entry}
                    isActive={entry.href === activeHref}
                  />
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function StandaloneLink({ link, isActive }: { link: NavLink; isActive: boolean }) {
  const guardedNavigate = useGuardedNavigate();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={link.label}
        className={cn(ROW_CLASS, "data-active:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary")}
        render={<Link href={link.href} onNavigate={guardedNavigate(link.href)} />}
      >
        <link.icon />
        <span>{link.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Expanded sidebar: group header toggles an indented list of its links. */
function GroupCollapsible({
  group,
  activeHref,
  open,
  onOpenChange,
}: {
  group: NavGroup;
  activeHref: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const guardedNavigate = useGuardedNavigate();
  const containsActive = group.items.some((item) => item.href === activeHref);

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} render={<SidebarMenuItem />}>
      <Collapsible.Trigger
        render={
          <SidebarMenuButton
            className={cn(
              ROW_CLASS,
              containsActive && "text-sidebar-foreground [&_svg:first-child]:text-sidebar-primary"
            )}
          />
        }
      >
        <group.icon />
        <span className="flex-1">{group.label}</span>
        <ChevronRightIcon
          aria-hidden
          className="ml-auto size-4! text-sidebar-foreground/40 transition-transform duration-200 group-data-panel-open/menu-button:rotate-90"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        <SidebarMenuSub className="mx-0 ml-[22px] gap-0.5 py-1 pr-0 pl-3">
          {group.items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton
                  isActive={isActive}
                  className={cn(
                    "relative h-8 overflow-visible px-3 text-sidebar-foreground/70",
                    // Marigold marker sitting on the sub-menu's guide line.
                    "before:absolute before:top-1.5 before:bottom-1.5 before:-left-3.5 before:w-[3px] before:rounded-full before:bg-transparent before:transition-colors",
                    "data-active:font-medium data-active:text-sidebar-foreground data-active:before:bg-sidebar-primary"
                  )}
                  render={<Link href={item.href} onNavigate={guardedNavigate(item.href)} />}
                >
                  <span>{item.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

/** Icon-only sidebar: group icon opens a flyout menu of its links. */
function GroupFlyout({
  group,
  activeHref,
}: {
  group: NavGroup;
  activeHref: string | undefined;
}) {
  const guardedNavigate = useGuardedNavigate();
  const containsActive = group.items.some((item) => item.href === activeHref);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              isActive={containsActive}
              aria-label={group.label}
              className={cn(ROW_CLASS, "data-active:[&_svg]:text-sidebar-primary")}
            />
          }
        >
          <group.icon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.items.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <DropdownMenuItem
                  key={item.href}
                  className={cn("gap-2.5 py-1.5", isActive && "bg-sidebar-accent font-medium")}
                  render={<Link href={item.href} onNavigate={guardedNavigate(item.href)} />}
                >
                  <item.icon className={cn("size-4", isActive && "text-sidebar-primary")} />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
