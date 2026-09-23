import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PackagesPagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav
      aria-label="Packages pagination"
      className="flex items-center justify-center gap-3"
    >
      {hasPrevious ? (
        <Button
          render={<Link href={buildHref(currentPage - 1)} />}
          nativeButton={false}
          variant="outline"
          size="icon-sm"
        >
          <ChevronLeftIcon />
          <span className="sr-only">Previous page</span>
        </Button>
      ) : (
        <Button variant="outline" size="icon-sm" disabled>
          <ChevronLeftIcon />
          <span className="sr-only">Previous page</span>
        </Button>
      )}

      <span className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </span>

      {hasNext ? (
        <Button
          render={<Link href={buildHref(currentPage + 1)} />}
          nativeButton={false}
          variant="outline"
          size="icon-sm"
        >
          <ChevronRightIcon />
          <span className="sr-only">Next page</span>
        </Button>
      ) : (
        <Button variant="outline" size="icon-sm" disabled>
          <ChevronRightIcon />
          <span className="sr-only">Next page</span>
        </Button>
      )}
    </nav>
  );
}
