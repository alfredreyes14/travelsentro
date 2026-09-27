"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { SearchIcon } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
} from "@tanstack/react-table";

import {
  VoucherForm,
  type VoucherPartnerOption,
  type VoucherContactOption,
  type VoucherRecord,
} from "./voucher-form";
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  VOUCHER_STATUSES,
  VOUCHER_STATUS_BADGE_CLASSNAME,
  VOUCHER_STATUS_BADGE_VARIANT,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  type VoucherStatus,
} from "@/lib/vouchers/status";

export type VoucherListItem = VoucherRecord & {
  partnerName: string | null;
  contactLabel: string | null;
  createdAt: string;
};

const STATUS_FILTER_ALL = "all";

const STATUS_FILTER_ITEMS = {
  [STATUS_FILTER_ALL]: "All statuses",
  ...VOUCHER_STATUS_LABELS,
};

const columns: ColumnDef<VoucherListItem>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.title}</p>
        <p className="text-sm text-muted-foreground">
          {row.original.valueLabel}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline">{VOUCHER_TYPE_LABELS[row.original.type]}</Badge>
    ),
  },
  {
    id: "partner",
    header: "Partner",
    cell: ({ row }) => row.original.partnerName ?? "In-house",
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => row.original.code ?? "—",
  },
  {
    id: "contact",
    header: "Assigned to",
    cell: ({ row }) => row.original.contactLabel ?? "Unassigned",
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue || filterValue === STATUS_FILTER_ALL) return true;
      return row.getValue(columnId) === filterValue;
    },
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <Badge
          variant={VOUCHER_STATUS_BADGE_VARIANT[status]}
          className={VOUCHER_STATUS_BADGE_CLASSNAME[status]}
        >
          {VOUCHER_STATUS_LABELS[status]}
        </Badge>
      );
    },
  },
  {
    accessorKey: "expiresAt",
    header: "Expires",
    cell: ({ row }) =>
      row.original.expiresAt
        ? format(new Date(row.original.expiresAt), "MMM d, yyyy")
        : "—",
  },
];

export function VoucherTable({
  vouchers,
  partners,
  contacts,
}: {
  vouchers: VoucherListItem[];
  partners: VoucherPartnerOption[];
  contacts: VoucherContactOption[];
}) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<VoucherListItem | null>(
    null
  );

  const table = useReactTable({
    data: vouchers,
    columns,
    state: { globalFilter, columnFilters },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      return (
        row.original.title.toLowerCase().includes(q) ||
        (row.original.code?.toLowerCase().includes(q) ?? false) ||
        (row.original.partnerName?.toLowerCase().includes(q) ?? false) ||
        (row.original.contactLabel?.toLowerCase().includes(q) ?? false)
      );
    },
  });

  const rows = table.getRowModel().rows;
  const hasVouchers = vouchers.length > 0;
  const hasNoMatches = hasVouchers && rows.length === 0;

  const statusFilterValue =
    (table.getColumn("status")?.getFilterValue() as VoucherStatus | undefined) ??
    STATUS_FILTER_ALL;

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingVoucher(null);
    router.refresh();
  }

  function handleClearFilters() {
    setGlobalFilter("");
    setColumnFilters([]);
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search by title, code, partner, or contact..."
            className="pl-8"
          />
        </div>
        <Select
          items={STATUS_FILTER_ITEMS}
          value={statusFilterValue}
          onValueChange={(value) =>
            table
              .getColumn("status")
              ?.setFilterValue(value === STATUS_FILTER_ALL ? undefined : value)
          }
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>All statuses</SelectItem>
            {VOUCHER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {VOUCHER_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button />}>Add Voucher</DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Voucher</DialogTitle>
            </DialogHeader>
            <VoucherForm
              mode="create"
              partners={partners}
              contacts={contacts}
              onSuccess={handleMutationSuccess}
            />
          </DialogContent>
        </Dialog>
      </DataTableToolbar>

      {hasNoMatches ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No vouchers match your search
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Try a different title, code, partner, contact, or status.
          </p>
          <Button variant="secondary" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setEditingVoucher(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={editingVoucher !== null}
        onOpenChange={(open) => !open && setEditingVoucher(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Voucher</DialogTitle>
          </DialogHeader>
          {editingVoucher && (
            <VoucherForm
              mode="edit"
              voucher={editingVoucher}
              partners={partners}
              contacts={contacts}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
