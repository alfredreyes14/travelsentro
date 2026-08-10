"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinIcon, CalendarIcon, SearchIcon } from "lucide-react";

import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxCollection,
  ComboboxItem,
} from "@/components/ui/combobox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MONTH_OPTIONS } from "@/lib/months";
import { cn } from "@/lib/utils";
import type { DestinationTile } from "@/components/homepage/destinations-section";

type DestinationGroup = { value: string; items: DestinationTile[] };

function groupDestinations(
  local: DestinationTile[],
  international: DestinationTile[]
): DestinationGroup[] {
  const byName = (a: DestinationTile, b: DestinationTile) =>
    a.name.localeCompare(b.name);

  return [
    { value: "International", items: [...international].sort(byName) },
    { value: "Local", items: [...local].sort(byName) },
  ].filter((group) => group.items.length > 0);
}

const FIELD_LABEL_CLASSES =
  "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export function HeroSearchBar({
  local,
  international,
  className,
}: {
  local: DestinationTile[];
  international: DestinationTile[];
  className?: string;
}) {
  const router = useRouter();
  const groups = useMemo(
    () => groupDestinations(local, international),
    [local, international]
  );

  const [destination, setDestination] = useState<DestinationTile | null>(
    null
  );
  const [month, setMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const yearOptions = [String(currentYear), String(currentYear + 1)];

  function handleSearch() {
    const params = new URLSearchParams();
    if (destination) params.set("destination", destination.slug);
    if (month) params.set("month", month);
    if (year) params.set("year", year);
    const query = params.toString();
    router.push(query ? `/packages?${query}` : "/packages");
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border-2 border-primary bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-primary/25 sm:p-2",
        className
      )}
    >
      <div className="flex flex-1 flex-col gap-1 px-2">
        <span className={FIELD_LABEL_CLASSES}>Destination</span>
        <Combobox
          items={groups}
          value={destination}
          onValueChange={setDestination}
          itemToStringLabel={(item: DestinationTile) => item.name}
        >
          <ComboboxInputGroup className="h-auto rounded-none border-0 bg-transparent p-0 focus-within:ring-0">
            <MapPinIcon
              className="size-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <ComboboxInput
              placeholder="Destination"
              className="p-0 text-sm font-semibold text-secondary placeholder:font-normal placeholder:text-muted-foreground"
            />
          </ComboboxInputGroup>

          <ComboboxPortal>
            <ComboboxPositioner>
              <ComboboxPopup>
                <ComboboxEmpty>No destinations found.</ComboboxEmpty>
                <ComboboxList>
                  {(group: DestinationGroup) => (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxGroupLabel>{group.value}</ComboboxGroupLabel>
                      <ComboboxCollection>
                        {(item: DestinationTile) => (
                          <ComboboxItem key={item.id} value={item}>
                            {item.name}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxPopup>
            </ComboboxPositioner>
          </ComboboxPortal>
        </Combobox>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2">
        <span className={FIELD_LABEL_CLASSES}>Month</span>
        <Select
          value={month ?? ""}
          onValueChange={(value) => setMonth(value || null)}
        >
          <SelectTrigger className="h-auto w-full gap-1.5 rounded-none border-0 bg-transparent p-0 text-sm font-semibold text-secondary data-placeholder:font-normal data-placeholder:text-muted-foreground">
            <CalendarIcon
              className="size-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2">
        <span className={FIELD_LABEL_CLASSES}>Year</span>
        <Select
          value={year ?? ""}
          onValueChange={(value) => setYear(value || null)}
        >
          <SelectTrigger className="h-auto w-full gap-1.5 rounded-none border-0 bg-transparent p-0 text-sm font-semibold text-secondary data-placeholder:font-normal data-placeholder:text-muted-foreground">
            <CalendarIcon
              className="size-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        onClick={handleSearch}
        className="flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-secondary/70 transition-colors hover:text-secondary sm:ml-1"
      >
        <SearchIcon className="size-4" aria-hidden="true" />
        Search
      </button>
    </div>
  );
}
