"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

import { linkQuoteToContact, unlinkQuoteFromContact } from "@/actions/quotes";
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
import { formatPackagePrice } from "@/lib/packages/format-price";

const QUOTE_ERROR_MESSAGE =
  "Something went wrong updating that quote. Please try again.";

export type ContactQuote = {
  id: string;
  quoteNo: string;
  title: string;
  pricePerPax: number;
  updatedAt: string;
};

export type UnlinkedQuote = {
  id: string;
  quoteNo: string;
  title: string;
  customerName: string | null;
};

/**
 * The quotes written for one contact. Rendered only for viewers with
 * can_manage_quotes (the page decides), since quotes are not readable
 * without it.
 */
export function ContactQuotesCard({
  contactId,
  quotes,
  unlinkedQuotes,
}: {
  contactId: string;
  quotes: ContactQuote[];
  unlinkedQuotes: UnlinkedQuote[];
}) {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const query = search.trim().toLowerCase();
  const matches = unlinkedQuotes.filter((quote) =>
    [quote.quoteNo, quote.title, quote.customerName].some((value) =>
      value?.toLowerCase().includes(query)
    )
  );

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
        toast.error(QUOTE_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Quotes</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsLinkOpen(true)}
          >
            Link existing
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/quotes/new?contactId=${contactId}`} />}
          >
            New quote
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {quotes.length === 0 ? (
          <p className="text-muted-foreground">
            No quotes linked to this contact yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
              >
                <Link
                  href={`/admin/quotes/${quote.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {quote.quoteNo}
                </Link>
                <span className="min-w-0 flex-1 truncate">{quote.title}</span>
                <span>{formatPackagePrice(quote.pricePerPax, null).final}</span>
                <span className="text-muted-foreground">
                  Updated {format(new Date(quote.updatedAt), "MMM d, yyyy")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () => unlinkQuoteFromContact(quote.id, contactId),
                      `${quote.quoteNo} unlinked.`
                    )
                  }
                >
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link an existing quote</DialogTitle>
            <DialogDescription>
              Quotes that aren&apos;t linked to any contact yet.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by quote number, title or customer..."
          />
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {unlinkedQuotes.length === 0
                ? "Every quote is already linked to a contact."
                : "No quotes match your search."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {matches.map((quote) => (
                <li key={quote.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{quote.quoteNo}</p>
                    <p className="truncate text-muted-foreground">
                      {quote.title}
                      {quote.customerName ? ` · ${quote.customerName}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => linkQuoteToContact(quote.id, contactId),
                        `${quote.quoteNo} linked.`
                      )
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
