"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { deactivateAccount } from "@/actions/users";
import { AccountForm } from "@/components/admin/account-form";
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Profile } from "@/lib/auth/dal";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export function UsersTable({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Profile | null>(null);
  const [deactivatingAccount, setDeactivatingAccount] =
    useState<Profile | null>(null);
  const [isDeactivating, startDeactivating] = useTransition();
  const [search, setSearch] = useState("");

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (profile) =>
        (profile.name ?? "").toLowerCase().includes(q) ||
        profile.email.toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const hasProfiles = profiles.length > 0;
  const hasNoMatches = hasProfiles && filteredProfiles.length === 0;

  function handleClearSearch() {
    setSearch("");
  }

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingAccount(null);
    router.refresh();
  }

  function handleDeactivate() {
    if (!deactivatingAccount) return;
    const target = deactivatingAccount;

    startDeactivating(async () => {
      try {
        const result = await deactivateAccount(target.id);
        if (result.ok) {
          toast.success("Account deactivated.");
          setDeactivatingAccount(null);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts by name or email..."
            className="pl-8"
          />
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            Add Staff Account
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Staff Account</DialogTitle>
            </DialogHeader>
            <AccountForm mode="create" onSuccess={handleMutationSuccess} />
          </DialogContent>
        </Dialog>
      </DataTableToolbar>

      {!hasProfiles ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No accounts yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a Staff or Admin account to get started.
          </p>
        </div>
      ) : hasNoMatches ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No accounts match your search
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Try a different name or email.
          </p>
          <Button variant="secondary" onClick={handleClearSearch}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>{profile.name ?? "—"}</TableCell>
                    <TableCell>{profile.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          profile.role === "admin" ? "default" : "secondary"
                        }
                      >
                        {profile.role === "admin" ? "Admin" : "Staff"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {profile.role === "admin" ? (
                          <Badge variant="outline">All</Badge>
                        ) : (
                          <>
                            {profile.can_manage_packages && (
                              <Badge variant="outline">Packages</Badge>
                            )}
                            {profile.can_message_customers && (
                              <Badge variant="outline">Messages</Badge>
                            )}
                            {profile.can_edit_crm && (
                              <Badge variant="outline">CRM</Badge>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          profile.is_active ? "secondary" : "destructive"
                        }
                      >
                        {profile.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                        >
                          <MoreHorizontalIcon />
                          <span className="sr-only">Open actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditingAccount(profile)}
                          >
                            Edit
                          </DropdownMenuItem>
                          {profile.is_active && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeactivatingAccount(profile)}
                            >
                              Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {filteredProfiles.map((profile) => (
              <Card key={profile.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{profile.name ?? "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {profile.email}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <MoreHorizontalIcon />
                      <span className="sr-only">Open actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditingAccount(profile)}
                      >
                        Edit
                      </DropdownMenuItem>
                      {profile.is_active && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeactivatingAccount(profile)}
                        >
                          Deactivate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={profile.role === "admin" ? "default" : "secondary"}
                  >
                    {profile.role === "admin" ? "Admin" : "Staff"}
                  </Badge>
                  {profile.role === "admin" ? (
                    <Badge variant="outline">All</Badge>
                  ) : (
                    <>
                      {profile.can_manage_packages && (
                        <Badge variant="outline">Packages</Badge>
                      )}
                      {profile.can_message_customers && (
                        <Badge variant="outline">Messages</Badge>
                      )}
                      {profile.can_edit_crm && (
                        <Badge variant="outline">CRM</Badge>
                      )}
                    </>
                  )}
                  <Badge
                    variant={profile.is_active ? "secondary" : "destructive"}
                  >
                    {profile.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog
        open={editingAccount !== null}
        onOpenChange={(open) => !open && setEditingAccount(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          {editingAccount && (
            <AccountForm
              mode="edit"
              account={editingAccount}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deactivatingAccount !== null}
        onOpenChange={(open) => !open && setDeactivatingAccount(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivatingAccount?.name ?? deactivatingAccount?.email} will
              be signed out immediately and won&apos;t be able to log in
              until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeactivating}
              onClick={handleDeactivate}
            >
              {isDeactivating ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
