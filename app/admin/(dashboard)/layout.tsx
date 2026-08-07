import { getProfile } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminSidebarHeader } from "@/components/admin/admin-sidebar-header";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdminUserFooter } from "@/components/admin/admin-user-footer";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

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
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <AdminSidebarHeader />
        </SidebarHeader>
        <SidebarContent>
          <AdminNav
            canManagePackages={canManagePackages}
            canManageUsers={canManageUsers}
          />
        </SidebarContent>
        <SidebarFooter>
          <AdminUserFooter name={profile.name} email={profile.email} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <AdminTopbar name={profile.name} email={profile.email} />
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
