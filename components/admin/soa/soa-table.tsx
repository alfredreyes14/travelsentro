"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

import { deleteSoa } from "@/actions/soa";
import { formatPeso } from "@/lib/soa/totals";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export type SoaListItem = {
  id: string;
  soaNo: string;
  billToName: string;
  issueDate: string;
  total: number;
  balance: number;
};

export function SoaTable({ statements }: { statements: SoaListItem[] }) {
  const [pendingDelete, setPendingDelete] = useState<SoaListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteSoa(pendingDelete.id);
      if (result.ok) toast.success(`${pendingDelete.soaNo} deleted.`);
      else toast.error(result.error);
    } catch {
      toast.error("Something went wrong deleting that statement. Please try again.");
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  if (statements.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No statements yet. Create one with <span className="font-medium">New SOA</span>.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SOA no.</TableHead>
            <TableHead>Bill to</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((soa) => (
            <TableRow key={soa.id}>
              <TableCell className="font-mono">{soa.soaNo}</TableCell>
              <TableCell>
                <Link href={`/admin/soa/${soa.id}`} className="font-medium hover:underline">
                  {soa.billToName}
                </Link>
              </TableCell>
              <TableCell>{format(parseISO(soa.issueDate), "MMM d, yyyy")}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPeso(soa.total)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {soa.balance === 0 ? (
                  <span className="text-green-700 dark:text-green-400">Paid</span>
                ) : (
                  formatPeso(soa.balance)
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<a href={`/admin/soa/${soa.id}/pdf`} download />}
                  >
                    Download PDF
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setPendingDelete(soa)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.soaNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              The statement for {pendingDelete?.billToName} will be permanently deleted.
              PDFs already downloaded are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
