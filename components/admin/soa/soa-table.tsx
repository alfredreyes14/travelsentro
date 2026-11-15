"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

import { deleteSoa } from "@/actions/soa";
import { todayInManila, type SoaKind } from "./soa-form-schema";
import { CLIENT_TYPE_LABELS, toClientType } from "@/lib/crm/stage";
import { formatPeso } from "@/lib/soa/totals";
import { Badge } from "@/components/ui/badge";
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
  kind: SoaKind;
  originalNo: string | null;
  billToName: string;
  contact: { id: string; name: string; clientType: string } | null;
  issueDate: string;
  total: number;
  paid: number;
  balance: number;
  nextDueDate: string | null;
};

export function BalanceCell({ balance }: { balance: number }) {
  if (balance === 0) return <span className="text-green-700 dark:text-green-400">Paid</span>;
  if (balance < 0) return <span>{formatPeso(-balance)} credit</span>;
  return <span>{formatPeso(balance)}</span>;
}

/** The next payment's due date, flagged when it has passed. */
export function NextDueCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const overdue = date < todayInManila();
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5 tabular-nums">
      <span className={overdue ? "text-destructive" : undefined}>
        {format(parseISO(date), "MMM d, yyyy")}
      </span>
      {overdue ? (
        <Badge variant="destructive" className="text-[11px]">
          Overdue
        </Badge>
      ) : null}
    </span>
  );
}

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
        No statements yet. Create one with <span className="font-medium">New SOA</span>, or
        record an older one with <span className="font-medium">Add Previous SOA</span>.
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
            <TableHead>CRM contact</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Total amount</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Next due</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((soa) => (
            <TableRow key={soa.id}>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-mono">{soa.soaNo}</span>
                  {soa.kind === "previous" ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline">Previous</Badge>
                      {soa.originalNo ? (
                        <span className="text-xs text-muted-foreground">{soa.originalNo}</span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Link href={`/admin/soa/${soa.id}`} className="font-medium hover:underline">
                  {soa.billToName}
                </Link>
              </TableCell>
              <TableCell>
                {soa.contact ? (
                  <Link
                    href={`/admin/crm/${soa.contact.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {soa.contact.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {CLIENT_TYPE_LABELS[toClientType(soa.contact.clientType)]}
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Not linked</span>
                )}
              </TableCell>
              <TableCell>{format(parseISO(soa.issueDate), "MMM d, yyyy")}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPeso(soa.total)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPeso(soa.paid)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <BalanceCell balance={soa.balance} />
              </TableCell>
              <TableCell className="text-right">
                <NextDueCell date={soa.nextDueDate} />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<a href={`/admin/soa/${soa.id}/pdf`} target="_blank" rel="noopener" />}
                  >
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<a href={`/admin/soa/${soa.id}/pdf?download=1`} download />}
                  >
                    Download
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setPendingDelete(soa)}>
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
              The statement for {pendingDelete?.billToName} will be permanently deleted,
              along with any attached file and its email history. Files already sent or
              downloaded are not affected.
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
