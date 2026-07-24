"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { SearchIcon } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";

import { MessageComposeDialog } from "./message-compose-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONTACT_STATUSES,
  STATUS_BADGE_CLASSNAME,
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
  type ContactStatus,
} from "@/lib/crm/status";

export type AdminContactListItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: ContactStatus;
  tags: string[];
  opted_out: boolean;
  createdAt: string;
};

const STATUS_FILTER_ALL = "all";

const columns: ColumnDef<AdminContactListItem>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          !table.getIsAllPageRowsSelected() &&
          table.getIsSomePageRowsSelected()
        }
        onCheckedChange={(checked) =>
          table.toggleAllPageRowsSelected(!!checked)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()} className="inline-flex">
        {row.original.opted_out ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Checkbox checked={false} disabled aria-label="Opted out" />
            </TooltipTrigger>
            <TooltipContent>
              Opted out — excluded from bulk sends
            </TooltipContent>
          </Tooltip>
        ) : (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label="Select row"
          />
        )}
      </div>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.original.email,
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
          variant={STATUS_BADGE_VARIANT[status]}
          className={STATUS_BADGE_CLASSNAME[status]}
        >
          {STATUS_LABELS[status]}
        </Badge>
      );
    },
  },
  {
    id: "tags",
    header: "Tags",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span title={new Date(row.original.createdAt).toLocaleString()}>
        {formatDistanceToNow(new Date(row.original.createdAt), {
          addSuffix: true,
        })}
      </span>
    ),
  },
];

export function CrmTable({ contacts }: { contacts: AdminContactListItem[] }) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const table = useReactTable({
    data: contacts,
    columns,
    state: { globalFilter, columnFilters, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => !row.original.opted_out,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      return (
        row.original.name.toLowerCase().includes(q) ||
        row.original.tags.some((t) => t.toLowerCase().includes(q))
      );
    },
  });

  const selectedRows = table.getSelectedRowModel().rows;

  const statusFilterValue =
    (table.getColumn("status")?.getFilterValue() as string | undefined) ??
    STATUS_FILTER_ALL;

  function handleClearFilters() {
    setGlobalFilter("");
    setColumnFilters([]);
  }

  const rows = table.getRowModel().rows;
  const hasContacts = contacts.length > 0;
  const hasNoMatches = hasContacts && rows.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search contacts by name or tag..."
            className="pl-8"
          />
        </div>
        <Select
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
            {CONTACT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedRows.length > 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <span className="text-sm font-medium">
            {selectedRows.length} selected
          </span>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => setRowSelection({})}>
            Clear
          </Button>
          <Button onClick={() => setIsComposeOpen(true)}>
            Message Selected
          </Button>
        </div>
      ) : null}

      {hasNoMatches ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No contacts match your search
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Try a different name, status, or tag.
          </p>
          <Button variant="secondary" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
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
                  onClick={() => router.push(`/admin/crm/${row.original.id}`)}
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

      <MessageComposeDialog
        contacts={selectedRows.map((r) => r.original)}
        mode="bulk"
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        onSuccess={() => {
          setRowSelection({});
          setIsComposeOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
