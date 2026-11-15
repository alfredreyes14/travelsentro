"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HistoryIcon, MessageCircleIcon, PlusIcon, SearchIcon } from "lucide-react";
import type { RowSelectionState } from "@tanstack/react-table";

import { ContactAddDialog } from "./contact-add-dialog";
import { CrmTable, type AdminContactListItem } from "./crm-table";
import { MessageComposeDialog } from "./message-compose-dialog";
import { MetaLeadSyncButton } from "./meta-lead-sync-button";
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  STAGES_BY_TYPE,
  STAGE_LABELS,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";

const TAG_FILTER_ALL = "__all__";
const STAGE_FILTER_ALL = "__all__";

const EMPTY_COPY: Record<ClientType, { title: string; body: string }> = {
  b2c: {
    title: "No B2C leads yet",
    body: "Leads appear here as soon as someone submits an inquiry on the public site or a Facebook lead ad, or when you add one.",
  },
  b2b: {
    title: "No B2B clients yet",
    body: "Add a company you work with, or convert an existing lead to B2B from its page.",
  },
};

function matchesSearch(contact: AdminContactListItem, query: string): boolean {
  if (!query) return true;
  return [
    contact.name,
    contact.email,
    contact.phone,
    contact.repName,
    ...contact.tags,
  ].some((value) => value?.toLowerCase().includes(query));
}

/**
 * The main Leads page: B2C / B2B tabs, a stage dropdown (with how many
 * leads sit in each stage), search, a tag filter, a paginated table, and
 * bulk messaging.
 */
export function CrmContactsView({
  contacts,
  initialType,
  canEdit,
  metaLeadSyncEnabled,
}: {
  contacts: AdminContactListItem[];
  initialType: ClientType;
  canEdit: boolean;
  /** Production only; see lib/meta-leads/run-sync.ts. */
  metaLeadSyncEnabled: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<ClientType>(initialType);
  const [stageFilter, setStageFilter] = useState<ContactStage | typeof STAGE_FILTER_ALL>(
    STAGE_FILTER_ALL
  );
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(TAG_FILTER_ALL);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const byType = useMemo(
    () => ({
      b2c: contacts.filter((contact) => contact.clientType === "b2c"),
      b2b: contacts.filter((contact) => contact.clientType === "b2b"),
    }),
    [contacts]
  );
  const tabContacts = byType[type];

  // Every tag in use, across both types, for the Add dialog's suggestions.
  const allTags = useMemo(
    () =>
      [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [contacts]
  );
  const tabTags = useMemo(
    () =>
      [...new Set(tabContacts.flatMap((contact) => contact.tags))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tabContacts]
  );

  // Counts ignore the search box and tag filter: they describe the pipeline.
  const stageCounts = useMemo(() => {
    const counts = new Map<ContactStage, number>();
    for (const contact of tabContacts) {
      counts.set(contact.stage, (counts.get(contact.stage) ?? 0) + 1);
    }
    return counts;
  }, [tabContacts]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tabContacts.filter(
        (contact) =>
          (stageFilter === STAGE_FILTER_ALL || contact.stage === stageFilter) &&
          (tagFilter === TAG_FILTER_ALL || contact.tags.includes(tagFilter)) &&
          matchesSearch(contact, query)
      ),
    [tabContacts, stageFilter, tagFilter, query]
  );

  const selected = tabContacts.filter((contact) => rowSelection[contact.id]);
  const isFiltered =
    stageFilter !== STAGE_FILTER_ALL || tagFilter !== TAG_FILTER_ALL || query !== "";

  function handleTypeChange(next: ClientType) {
    setType(next);
    setStageFilter(STAGE_FILTER_ALL);
    setTagFilter(TAG_FILTER_ALL);
    setRowSelection({});
    // Keeps the tab across a refresh or a shared link without a server
    // round trip (Next's router picks up native history updates).
    window.history.replaceState(null, "", `?type=${next}`);
  }

  function handleClearFilters() {
    setStageFilter(STAGE_FILTER_ALL);
    setTagFilter(TAG_FILTER_ALL);
    setSearch("");
  }

  const stageFilterItems: Record<string, string> = {
    [STAGE_FILTER_ALL]: `All stages (${tabContacts.length})`,
    ...Object.fromEntries(
      STAGES_BY_TYPE[type].map((stage) => [
        stage,
        `${STAGE_LABELS[stage]} (${stageCounts.get(stage) ?? 0})`,
      ])
    ),
  };

  const tagFilterItems = {
    [TAG_FILTER_ALL]: "All tags",
    ...Object.fromEntries(tabTags.map((tag) => [tag, tag])),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Leads
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/admin/crm/sync-log" />}
          >
            <HistoryIcon className="size-4" />
            Sync log
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/admin/crm/messenger" />}
          >
            <MessageCircleIcon className="size-4" />
            Messenger settings
          </Button>
          {canEdit ? (
            <>
              <MetaLeadSyncButton enabled={metaLeadSyncEnabled} />
              <Button onClick={() => setIsAddOpen(true)}>
                <PlusIcon className="size-4" />
                Add Lead
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Tabs
        value={type}
        onValueChange={(value) => handleTypeChange(value as ClientType)}
        className="gap-4"
      >
        <TabsList>
          {CLIENT_TYPES.map((clientType) => (
            <TabsTrigger key={clientType} value={clientType} className="px-3">
              {CLIENT_TYPE_LABELS[clientType]}
              <span className="text-muted-foreground">
                {byType[clientType].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={type} className="flex flex-col gap-4">
          <DataTableToolbar>
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  type === "b2b"
                    ? "Search by company, representative, email, phone or tag..."
                    : "Search by name, email, phone or tag..."
                }
                className="pl-8"
              />
            </div>
            <Select
              items={stageFilterItems}
              value={stageFilter}
              onValueChange={(value) =>
                setStageFilter(value as ContactStage | typeof STAGE_FILTER_ALL)
              }
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Filter by stage">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STAGE_FILTER_ALL}>
                  {stageFilterItems[STAGE_FILTER_ALL]}
                </SelectItem>
                {STAGES_BY_TYPE[type].map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stageFilterItems[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={tagFilterItems}
              value={tagFilter}
              onValueChange={(value) => setTagFilter(value as string)}
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter by tag">
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TAG_FILTER_ALL}>All tags</SelectItem>
                {tabTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableToolbar>

          {selected.length > 0 ? (
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">
                {selected.length} selected
              </span>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setRowSelection({})}>
                Clear
              </Button>
              <Button variant="outline" onClick={() => setIsFollowUpOpen(true)}>
                Follow Up Selected
              </Button>
              <Button onClick={() => setIsComposeOpen(true)}>
                Message Selected
              </Button>
            </div>
          ) : null}

          {tabContacts.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
              <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
                {EMPTY_COPY[type].title}
              </h2>
              <p className="text-base leading-[1.5] text-muted-foreground">
                {EMPTY_COPY[type].body}
              </p>
              {canEdit ? (
                <Button variant="secondary" onClick={() => setIsAddOpen(true)}>
                  Add Lead
                </Button>
              ) : null}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
              <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
                No leads match your filters
              </h2>
              <p className="text-base leading-[1.5] text-muted-foreground">
                Try a different stage, tag or search.
              </p>
              {isFiltered ? (
                <Button variant="secondary" onClick={handleClearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <CrmTable
              type={type}
              contacts={visible}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
          )}
        </TabsContent>
      </Tabs>

      <MessageComposeDialog
        contacts={selected}
        mode="bulk"
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        onSuccess={() => {
          setRowSelection({});
          setIsComposeOpen(false);
          router.refresh();
        }}
      />

      <MessageComposeDialog
        contacts={selected}
        mode="bulk"
        followUp={{ sequence: "no_reply", step: 1 }}
        open={isFollowUpOpen}
        onOpenChange={setIsFollowUpOpen}
        onSuccess={() => {
          setRowSelection({});
          setIsFollowUpOpen(false);
          router.refresh();
        }}
      />

      <ContactAddDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        defaultType={type}
        existingTags={allTags}
      />
    </div>
  );
}
