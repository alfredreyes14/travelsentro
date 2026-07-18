"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { deactivateAccount } from "@/actions/users";
import { AccountForm } from "@/components/admin/account-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <div className="flex justify-end">
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
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
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
            {profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell>{profile.name ?? "—"}</TableCell>
                <TableCell>{profile.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={profile.role === "admin" ? "default" : "secondary"}
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
                    variant={profile.is_active ? "secondary" : "destructive"}
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
