"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

import { linkSoaToContact, unlinkSoaFromContact } from "@/actions/soa";
import { BalanceCell, NextDueCell } from "@/components/admin/soa/soa-table";
import { formatPeso } from "@/lib/soa/totals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const SOA_ERROR_MESSAGE =
  "Something went wrong updating that statement. Please try again.";

export type ContactSoa = {
  id: string;
  soaNo: string;
  isPrevious: boolean;
  originalNo: string | null;
  issueDate: string;
  total: number;
  balance: number;
  nextDueDate: string | null;
};

export type UnlinkedSoa = {
  id: string;
  soaNo: string;
  originalNo: string | null;
  billToName: string;
  total: number;
};

/**
 * The SOAs billed to one contact (B2C or B2B), with their totals. Rendered
 * only for viewers with can_manage_quotes (the page decides), since
 * statements aren't readable without it.
 */
export function ContactSoaCard({
  contactId,
  statements,
  unlinkedStatements,
}: {
  contactId: string;
  statements: ContactSoa[];
  unlinkedStatements: UnlinkedSoa[];
}) {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const query = search.trim().toLowerCase();
  const matches = unlinkedStatements.filter((soa) =>
    [soa.soaNo, soa.originalNo, soa.billToName].some((value) =>
      value?.toLowerCase().includes(query)
    )
  );

  const billed = statements.reduce((sum, soa) => sum + soa.total, 0);
  const outstanding = statements.reduce((sum, soa) => sum + Math.max(soa.balance, 0), 0);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(success);
          setIsLinkOpen(false);
          setSearch("");
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(SOA_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Statements of Account</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setIsLinkOpen(true)}>
            Link existing
          </Button>
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/soa/new?kind=previous&contactId=${contactId}`} />}
          >
            Add previous SOA
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/soa/new?contactId=${contactId}`} />}
          >
            New SOA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {statements.length === 0 ? (
          <p className="text-muted-foreground">No statements linked to this contact yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                Total billed <span className="font-semibold tabular-nums">{formatPeso(billed)}</span>
              </span>
              <span>
                Outstanding{" "}
                <span className="font-semibold tabular-nums">{formatPeso(outstanding)}</span>
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {statements.map((soa) => (
                <li key={soa.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <Link
                    href={`/admin/soa/${soa.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {soa.soaNo}
                  </Link>
                  {soa.isPrevious ? (
                    <Badge variant="outline">
                      Previous{soa.originalNo ? ` · ${soa.originalNo}` : ""}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground">
                    {format(parseISO(soa.issueDate), "MMM d, yyyy")}
                  </span>
                  <span className="ml-auto tabular-nums">{formatPeso(soa.total)}</span>
                  <span className="tabular-nums">
                    <BalanceCell balance={soa.balance} />
                  </span>
                  {soa.nextDueDate ? (
                    <span className="text-muted-foreground">
                      Next due <NextDueCell date={soa.nextDueDate} />
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<a href={`/admin/soa/${soa.id}/pdf`} target="_blank" rel="noopener" />}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(() => unlinkSoaFromContact(soa.id, contactId), `${soa.soaNo} unlinked.`)
                    }
                  >
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link an existing SOA</DialogTitle>
            <DialogDescription>
              Statements that aren&apos;t linked to any contact yet — for example, ones
              made before this customer was in the CRM.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by SOA number or name..."
          />
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {unlinkedStatements.length === 0
                ? "Every statement is already linked to a contact."
                : "No statements match your search."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {matches.map((soa) => (
                <li key={soa.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {soa.soaNo}
                      {soa.originalNo ? ` · ${soa.originalNo}` : ""}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {soa.billToName} · {formatPeso(soa.total)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(() => linkSoaToContact(soa.id, contactId), `${soa.soaNo} linked.`)
                    }
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
