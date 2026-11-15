"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

import { ContactStageChip } from "./contact-stage-chip";
import { FollowUpBadge } from "./follow-up-badge";
import { ContractEndChip } from "./contract-end-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SERVICE_LABELS, type ServiceKey } from "@/lib/crm/services";
import { STAGES_BY_TYPE, type ClientType, type ContactStage } from "@/lib/crm/stage";
import type { FollowUpProgress } from "@/lib/follow-ups/progress";

const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export type AdminContactListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  clientType: ClientType;
  stage: ContactStage;
  followUp?: FollowUpProgress;
  /** Staff sent a picture in the lead's chat: "Mark as Quotation?". */
  quoteSuggestedAt?: string | null;
  tags: string[];
  opted_out: boolean;
  servicesAvailed: ServiceKey[];
  servicesOther: string | null;
  repName: string | null;
  contractEnd: string | null;
  createdAt: string;
  /** Latest inquiry (website form or Meta lead ad); null if none. */
  lastInquiryAt: string | null;
  /** Latest email/SMS sent or contact logged by staff; null if never. */
  lastContactedAt: string | null;
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

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Sort key and display date: the latest inquiry, else when the lead was added. */
function inquiryDate(contact: AdminContactListItem): string {
  return contact.lastInquiryAt ?? contact.createdAt;
}

export const DEFAULT_SORTING: SortingState = [{ id: "inquiryDate", desc: true }];

// Phones get no table headers to click, so sorting is a dropdown there.
const MOBILE_SORTS = {
  inquiry_desc: { id: "inquiryDate", desc: true },
  inquiry_asc: { id: "inquiryDate", desc: false },
  contact_desc: { id: "lastContact", desc: true },
  contact_asc: { id: "lastContact", desc: false },
  name_asc: { id: "name", desc: false },
} as const;
type MobileSortKey = keyof typeof MOBILE_SORTS;
const MOBILE_SORT_LABELS: Record<MobileSortKey, string> = {
  inquiry_desc: "Latest inquiry first",
  inquiry_asc: "Oldest inquiry first",
  contact_desc: "Most recently contacted",
  contact_asc: "Least recently contacted",
  name_asc: "Name A–Z",
};

function mobileSortValue(sorting: SortingState): MobileSortKey | null {
  const current = sorting[0];
  if (!current) return null;
  const match = (Object.keys(MOBILE_SORTS) as MobileSortKey[]).find(
    (key) => MOBILE_SORTS[key].id === current.id && MOBILE_SORTS[key].desc === current.desc
  );
  return match ?? null;
}

function InquiryDate({ contact }: { contact: AdminContactListItem }) {
  const date = new Date(inquiryDate(contact));
  return (
    <div className="flex flex-col" title={dateTimeFormat.format(date)}>
      <span>{dateFormat.format(date)}</span>
      {contact.lastInquiryAt ? null : (
        <span className="text-xs text-muted-foreground">Added, no inquiry</span>
      )}
    </div>
  );
}

function LastContact({ contact }: { contact: AdminContactListItem }) {
  if (!contact.lastContactedAt) {
    return <span className="text-muted-foreground">Never</span>;
  }
  const date = new Date(contact.lastContactedAt);
  return (
    <div className="flex flex-col" title={dateTimeFormat.format(date)}>
      <span>{dateFormat.format(date)}</span>
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(date, { addSuffix: true })}
      </span>
    </div>
  );
}

function StageCell({ contact }: { contact: AdminContactListItem }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <ContactStageChip stage={contact.stage} />
      <FollowUpBadge
        progress={contact.followUp}
        clientType={contact.clientType}
        stage={contact.stage}
      />
      {contact.quoteSuggestedAt ? (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
          Quote sent? Check Messenger to-do
        </Badge>
      ) : null}
    </div>
  );
}

const stageColumn: ColumnDef<AdminContactListItem> = {
  accessorKey: "stage",
  header: ({ column }) => <SortableHeader label="Stage" column={column} />,
  // Pipeline order (New first), not alphabetical.
  sortingFn: (a, b) => {
    const order = STAGES_BY_TYPE[a.original.clientType];
    return order.indexOf(a.original.stage) - order.indexOf(b.original.stage);
  },
  cell: ({ row }) => <StageCell contact={row.original} />,
};

const inquiryDateColumn: ColumnDef<AdminContactListItem> = {
  id: "inquiryDate",
  accessorFn: inquiryDate,
  sortDescFirst: true,
  header: ({ column }) => <SortableHeader label="Inquiry date" column={column} />,
  cell: ({ row }) => <InquiryDate contact={row.original} />,
};

const lastContactColumn: ColumnDef<AdminContactListItem> = {
  id: "lastContact",
  // undefined (not null) so sortUndefined applies: never contacted counts as
  // the oldest contact -- last when newest-first, first when oldest-first.
  accessorFn: (contact) => contact.lastContactedAt ?? undefined,
  sortUndefined: -1,
  sortDescFirst: true,
  header: ({ column }) => <SortableHeader label="Last contact" column={column} />,
  cell: ({ row }) => <LastContact contact={row.original} />,
};

const tagsColumn: ColumnDef<AdminContactListItem> = {
  id: "tags",
  header: "Tags",
  cell: ({ row }) => <TagList contact={row.original} />,
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
    inquiryDateColumn,
    lastContactColumn,
    {
      id: "services",
      header: "Services",
      cell: ({ row }) => <ServiceList contact={row.original} />,
    },
    tagsColumn,
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
    inquiryDateColumn,
    lastContactColumn,
    tagsColumn,
  ],
};

/**
 * The leads table (desktop) and cards (mobile) for one client type.
 * Filtering and the selection state live in CrmContactsView; this owns
 * sorting, pagination and layout. The page resets to the first one
 * whenever the filtered rows or the sort change (autoResetPageIndex).
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
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const columns = useMemo(() => COLUMNS[type], [type]);

  const table = useReactTable({
    data: contacts,
    columns,
    state: { rowSelection, sorting, pagination },
    onRowSelectionChange,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: true,
    // Header clicks flip between descending and ascending; never back to
    // unsorted, so there is always a defined order.
    enableSortingRemoval: false,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => !row.original.opted_out,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const total = contacts.length;
  const { pageIndex, pageSize } = pagination;
  const firstRow = total === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(total, (pageIndex + 1) * pageSize);
  const pageCount = Math.max(1, table.getPageCount());

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
        <Select
          items={MOBILE_SORT_LABELS}
          value={mobileSortValue(sorting)}
          onValueChange={(value) => {
            const option = MOBILE_SORTS[value as MobileSortKey];
            if (option) setSorting([option]);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Sort leads">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MOBILE_SORTS) as MobileSortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {MOBILE_SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <StageCell contact={contact} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {type === "b2b" && contact.contractEnd ? (
                  <ContractEndChip end={contact.contractEnd} />
                ) : null}
                <TagList contact={contact} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {contact.lastInquiryAt
                  ? `Inquired ${dateFormat.format(new Date(contact.lastInquiryAt))}`
                  : `Added ${dateFormat.format(new Date(contact.createdAt))}`}
                {" · "}
                {contact.lastContactedAt
                  ? `Last contact ${formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true })}`
                  : "Never contacted"}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {firstRow}–{lastRow} of {total} lead{total === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            items={Object.fromEntries(PAGE_SIZES.map((size) => [String(size), String(size)]))}
            value={String(pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
  );
}
