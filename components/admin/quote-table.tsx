"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

import { deleteQuote } from "@/actions/quotes";
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

export type QuoteListItem = {
  id: string;
  quoteNo: string;
  title: string;
  customerLabel: string | null;
  updatedAt: string;
};

export function QuoteTable({ quotes }: { quotes: QuoteListItem[] }) {
  const [pendingDelete, setPendingDelete] = useState<QuoteListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteQuote(pendingDelete.id);
      if (result.ok) toast.success(`${pendingDelete.quoteNo} deleted.`);
      else toast.error(result.error);
    } catch {
      toast.error("Something went wrong deleting that quote. Please try again.");
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  if (quotes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No quotes yet. Create one with <span className="font-medium">New Quote</span>.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quote no.</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((quote) => (
            <TableRow key={quote.id}>
              <TableCell className="font-mono">{quote.quoteNo}</TableCell>
              <TableCell>
                <Link href={`/admin/quotes/${quote.id}`} className="font-medium hover:underline">
                  {quote.title}
                </Link>
              </TableCell>
              <TableCell>{quote.customerLabel ?? "—"}</TableCell>
              <TableCell>{format(new Date(quote.updatedAt), "MMM d, yyyy")}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<a href={`/admin/quotes/${quote.id}/pdf`} download />}
                  >
                    Download PDF
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setPendingDelete(quote)}
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
            <AlertDialogTitle>Delete {pendingDelete?.quoteNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.title}&quot; will be permanently deleted.
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
