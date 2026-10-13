"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

import { ContactStageChip } from "./contact-stage-chip";
import { ContractEndChip } from "./contract-end-chip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SERVICE_LABELS, type ServiceKey } from "@/lib/crm/services";
import type { ClientType, ContactStage } from "@/lib/crm/stage";

export type AdminContactListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  clientType: ClientType;
  stage: ContactStage;
  tags: string[];
  opted_out: boolean;
  servicesAvailed: ServiceKey[];
  servicesOther: string | null;
  repName: string | null;
  contractEnd: string | null;
  createdAt: string;
};

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<AdminContactListItem, unknown>;
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

function TagList({ contact }: { contact: AdminContactListItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {contact.tags.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
      {contact.opted_out ? <Badge variant="outline">Opted out</Badge> : null}
    </div>
  );
}

function ServiceList({ contact }: { contact: AdminContactListItem }) {
  if (contact.servicesAvailed.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {contact.servicesAvailed.map((key) => (
        <Badge
          key={key}
          variant="secondary"
          title={
            key === "other" ? (contact.servicesOther ?? undefined) : undefined
          }
        >
          {SERVICE_LABELS[key]}
        </Badge>
      ))}
    </div>
  );
}

const selectColumn: ColumnDef<AdminContactListItem> = {
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={
        !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()
      }
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
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
          <TooltipContent>Opted out — excluded from bulk sends</TooltipContent>
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
};

const stageColumn: ColumnDef<AdminContactListItem> = {
  accessorKey: "stage",
  header: "Stage",
  cell: ({ row }) => <ContactStageChip stage={row.original.stage} />,
};

const tagsColumn: ColumnDef<AdminContactListItem> = {
  id: "tags",
  header: "Tags",
  cell: ({ row }) => <TagList contact={row.original} />,
};

const createdColumn: ColumnDef<AdminContactListItem> = {
  accessorKey: "createdAt",
  header: ({ column }) => <SortableHeader label="Created" column={column} />,
  cell: ({ row }) => (
    <span title={new Date(row.original.createdAt).toLocaleString()}>
      {formatDistanceToNow(new Date(row.original.createdAt), {
        addSuffix: true,
      })}
    </span>
  ),
};

const COLUMNS: Record<ClientType, ColumnDef<AdminContactListItem>[]> = {
  b2c: [
    selectColumn,
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader label="Name" column={column} />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "contact",
      header: "Email / phone",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.email ?? row.original.phone ?? "—"}</span>
          {row.original.email && row.original.phone ? (
            <span className="text-muted-foreground">{row.original.phone}</span>
          ) : null}
        </div>
      ),
    },
    stageColumn,
    {
      id: "services",
      header: "Services",
      cell: ({ row }) => <ServiceList contact={row.original} />,
    },
    tagsColumn,
    createdColumn,
  ],
  b2b: [
    selectColumn,
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader label="Company" column={column} />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "repName",
      header: "Representative",
      cell: ({ row }) => row.original.repName ?? "—",
    },
    stageColumn,
    {
      id: "contractEnd",
      // undefined (not null) so `sortUndefined` applies: contacts with no
      // contract end sort last, whichever way the column is sorted.
      accessorFn: (contact) => contact.contractEnd ?? undefined,
      sortUndefined: "last",
      header: ({ column }) => (
        <SortableHeader label="Contract end" column={column} />
      ),
      cell: ({ row }) => <ContractEndChip end={row.original.contractEnd} />,
    },
    tagsColumn,
    createdColumn,
  ],
};

/**
 * The contacts table (desktop) and cards (mobile) for one client type.
 * Filtering and the selection state live in CrmContactsView; this owns
 * only sorting and layout.
 */
export function CrmTable({
  type,
  contacts,
  rowSelection,
  onRowSelectionChange,
}: {
  type: ClientType;
  contacts: AdminContactListItem[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(() => COLUMNS[type], [type]);

  const table = useReactTable({
    data: contacts,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => !row.original.opted_out,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
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

      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const contact = row.original;
          const selectCell = row
            .getVisibleCells()
            .find((cell) => cell.column.id === "select")!;
          return (
            <Card
              key={row.id}
              className="cursor-pointer p-4 transition-colors hover:bg-muted/50 active:bg-muted"
              onClick={() => router.push(`/admin/crm/${contact.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                {flexRender(
                  selectCell.column.columnDef.cell,
                  selectCell.getContext()
                )}
                <div className="flex-1">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {type === "b2b"
                      ? (contact.repName ?? contact.email ?? contact.phone ?? "—")
                      : (contact.email ?? contact.phone ?? "—")}
                  </p>
                </div>
                <ContactStageChip stage={contact.stage} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {type === "b2b" && contact.contractEnd ? (
                  <ContractEndChip end={contact.contractEnd} />
                ) : null}
                <TagList contact={contact} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
