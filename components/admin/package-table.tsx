"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";

import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { PackageListCard } from "@/components/admin/package-list-card";
import { PackageListRow } from "@/components/admin/package-list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AdminPackageListItem,
  AdminPackageTravelDate,
} from "@/app/admin/(dashboard)/packages/page";

const STATUS_FILTER_ALL = "all";
const DESTINATION_FILTER_ALL = "all";
const PAGE_SIZE = 10;

// Passed to <Select> so <SelectValue> can render the selected label while the
// (portalled) item list is unmounted — same pattern as crm-table.tsx.
const STATUS_FILTER_ITEMS: Record<string, string> = {
  [STATUS_FILTER_ALL]: "All statuses",
  published: "Published",
  draft: "Draft",
};

type TravelDateFilter = { from: string; to: string };

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<AdminPackageListItem, unknown>;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 [&>svg]:hover:text-foreground"
      onClick={() => column.toggleSorting()}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}

// Accessor-only columns: the table drives search / filter / sort / paginate,
// while the visible rows render through PackageListRow / PackageListCard.
const columns: ColumnDef<AdminPackageListItem>[] = [
  { id: "name", accessorFn: (row) => row.name },
  {
    id: "destination",
    accessorFn: (row) => row.destinationName ?? "",
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue || filterValue === DESTINATION_FILTER_ALL) return true;
      return row.getValue(columnId) === filterValue;
    },
  },
  {
    id: "travelDates",
    accessorFn: (row) => row.travelDates,
    filterFn: (row, columnId, filterValue: TravelDateFilter) => {
      const { from, to } = filterValue;
      if (!from && !to) return true;
      const lo = from || "0000-01-01";
      const hi = to || "9999-12-31";
      const ranges = row.getValue<AdminPackageTravelDate[]>(columnId);
      // A package matches when any of its date ranges overlaps [lo, hi].
      return ranges.some((range) => range.from <= hi && range.to >= lo);
    },
  },
  {
    id: "status",
    accessorFn: (row) => row.isPublished,
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue || filterValue === STATUS_FILTER_ALL) return true;
      return row.getValue(columnId) === (filterValue === "published");
    },
  },
  { id: "featured", accessorFn: (row) => row.isFeatured },
  { id: "createdAt", accessorFn: (row) => row.createdAt },
];

export function PackageTable({
  items,
  destinations,
}: {
  items: AdminPackageListItem[];
  destinations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const visibleItems = useMemo(
    () => items.filter((item) => !removedIds.has(item.id)),
    [items, removedIds]
  );

  const destinationOptions = useMemo(() => {
    const names = new Set(destinations.map((d) => d.name));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [destinations]);

  const destinationFilterItems = useMemo(() => {
    const map: Record<string, string> = {
      [DESTINATION_FILTER_ALL]: "All destinations",
    };
    for (const name of destinationOptions) map[name] = name;
    return map;
  }, [destinationOptions]);

  const table = useReactTable({
    data: visibleItems,
    columns,
    state: { globalFilter, columnFilters, sorting, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).toLowerCase().trim();
      if (!query) return true;
      const { name, destinationName } = row.original;
      return (
        name.toLowerCase().includes(query) ||
        (destinationName?.toLowerCase().includes(query) ?? false)
      );
    },
  });

  const statusFilterValue =
    (table.getColumn("status")?.getFilterValue() as string | undefined) ??
    STATUS_FILTER_ALL;
  const destinationFilterValue =
    (table.getColumn("destination")?.getFilterValue() as string | undefined) ??
    DESTINATION_FILTER_ALL;
  // The travel-date inputs are held in local draft state and pushed to the
  // table filter after a short debounce: a native date picker then updates
  // the table on its own (no extra click), while a rapid from → to edit
  // still coalesces into a single filter change.
  const travelDatesColumn = table.getColumn("travelDates");
  const [dateDraft, setDateDraft] = useState<TravelDateFilter>(
    () =>
      (travelDatesColumn?.getFilterValue() as TravelDateFilter | undefined) ?? {
        from: "",
        to: "",
      }
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      travelDatesColumn?.setFilterValue(
        dateDraft.from || dateDraft.to ? dateDraft : undefined
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [dateDraft, travelDatesColumn]);

  function handleClearFilters() {
    setGlobalFilter("");
    setColumnFilters([]);
    setDateDraft({ from: "", to: "" });
  }

  function handleMutated() {
    router.refresh();
  }

  function handleDeleted(id: string) {
    setRemovedIds((current) => new Set(current).add(id));
  }

  const hasActiveFilters = globalFilter !== "" || columnFilters.length > 0;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const hasNoMatches = visibleItems.length > 0 && filteredCount === 0;
  const pageRows = table.getRowModel().rows;
  const pageCount = Math.max(table.getPageCount(), 1);
  const { pageIndex } = table.getState().pagination;

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar className="flex-wrap gap-x-3 gap-y-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search by name or destination..."
            className="pl-8"
          />
        </div>

        <Select
          items={destinationFilterItems}
          value={destinationFilterValue}
          onValueChange={(value) =>
            table
              .getColumn("destination")
              ?.setFilterValue(
                value === DESTINATION_FILTER_ALL ? undefined : value
              )
          }
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All destinations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DESTINATION_FILTER_ALL}>
              All destinations
            </SelectItem>
            {destinationOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={STATUS_FILTER_ITEMS}
          value={statusFilterValue}
          onValueChange={(value) =>
            table
              .getColumn("status")
              ?.setFilterValue(
                value === STATUS_FILTER_ALL ? undefined : value
              )
          }
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="Travel date from"
            value={dateDraft.from}
            max={dateDraft.to || undefined}
            onChange={(e) =>
              setDateDraft((draft) => ({ ...draft, from: e.target.value }))
            }
            className="w-40"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="Travel date to"
            value={dateDraft.to}
            min={dateDraft.from || undefined}
            onChange={(e) =>
              setDateDraft((draft) => ({ ...draft, to: e.target.value }))
            }
            className="w-40"
          />
        </div>

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        ) : null}
      </DataTableToolbar>

      {hasNoMatches ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No packages match your filters
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Try a different name, destination, status, or travel date.
          </p>
          <Button variant="secondary" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    <span className="sr-only">Photo</span>
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label="Name"
                      column={table.getColumn("name")!}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label="Destination"
                      column={table.getColumn("destination")!}
                    />
                  </TableHead>
                  <TableHead>Travel dates</TableHead>
                  <TableHead>
                    <SortableHeader
                      label="Published"
                      column={table.getColumn("status")!}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label="Featured"
                      column={table.getColumn("featured")!}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label="Created"
                      column={table.getColumn("createdAt")!}
                    />
                  </TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <PackageListRow
                    key={row.id}
                    item={row.original}
                    onMutated={handleMutated}
                    onDeleted={handleDeleted}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {pageRows.map((row) => (
              <PackageListCard
                key={row.id}
                item={row.original}
                onMutated={handleMutated}
                onDeleted={handleDeleted}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {filteredCount} package{filteredCount === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeftIcon />
                <span className="sr-only">Previous page</span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRightIcon />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
