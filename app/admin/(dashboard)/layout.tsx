import Link from "next/link";
import {
  PackageIcon,
  ContactIcon,
  UsersIcon,
  LogOutIcon,
  LayoutTemplateIcon,
} from "lucide-react";

import { getProfile } from "@/lib/auth/dal";
import { logout } from "@/actions/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export default async function AdminDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Re-validates is_active on every request (D-05) — this is the ONLY place
  // in the admin shell that calls getProfile(), keeping login/forgot/reset
  // pages outside this gate.
  const profile = await getProfile();

  const canManagePackages = profile.role === "admin" || profile.can_manage_packages;
  const canManageUsers = profile.role === "admin";

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span className="font-heading px-2 text-lg font-semibold">
            TravelSentro
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* D-13: hidden entirely (not disabled) when the permission is
                    absent. Server-side enforcement still happens independently
                    via requirePermission()/requireAdmin() (AUTH-05). */}
                {canManagePackages && (
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" render={<Link href="/admin/packages" />}>
                      <PackageIcon />
                      <span>Packages</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* T-06-21: hidden entirely (not disabled) when the
                    permission is absent, reusing the identical
                    canManagePackages boolean already computed for Packages
                    above -- no new permission toggle. Server-side
                    enforcement still happens independently via
                    requirePermissionOrRedirect() (AUTH-05). */}
                {canManagePackages && (
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" render={<Link href="/admin/content" />}>
                      <LayoutTemplateIcon />
                      <span>Content</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* CRM-03: universal read -- every authenticated Admin/Staff
                    sees "Contacts" regardless of can_edit_crm, deliberately
                    NOT permission-gated (unlike Packages/Users above). */}
                <SidebarMenuItem>
                  <SidebarMenuButton size="lg" render={<Link href="/admin/crm" />}>
                    <ContactIcon />
                    <span>Contacts</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {canManageUsers && (
                  <SidebarMenuItem>
                    <SidebarMenuButton size="lg" render={<Link href="/admin/users" />}>
                      <UsersIcon />
                      <span>Users</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col gap-2 px-2 py-1 text-sm">
            <div className="truncate">
              <p className="truncate font-medium">
                {profile.name ?? profile.email}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/70">
                {profile.email}
              </p>
            </div>
            <form action={logout}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOutIcon className="size-4" />
                Log Out
              </Button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3 shadow-sm bg-background">
          <SidebarTrigger className="size-11" />
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
