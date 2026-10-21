"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";

import { deleteEvent, setEventFeatured, setEventPublished } from "@/actions/events";
import type { EventRecord } from "./event-form";
import { EVENT_TYPE_LABELS } from "@/lib/events/event-type";
import { formatEventDates, isUpcoming } from "@/lib/events/event-dates";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Admin list of every event, newest start date first (the page orders
 * them). The Published and Homepage switches save immediately and roll
 * back with the action's message on failure, like Partners' visibility
 * switch. `today` is Manila's date, computed on the server so the
 * Upcoming/Past chip can't differ between server and client render.
 */
export function EventsTable({
  initialItems,
  today,
}: {
  initialItems: EventRecord[];
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  // Adjusts `items` when fresh props arrive after router.refresh() (see
  // partners-list.tsx).
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }
  const [deletingItem, setDeletingItem] = useState<EventRecord | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  function patchItem(id: string, patch: Partial<EventRecord>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleDelete() {
    if (!deletingItem) return;
    const target = deletingItem;

    startDeleting(async () => {
      try {
        const result = await deleteEvent(target.id);
        if (result.ok) {
          toast.success("Event deleted.");
          setItems((current) => current.filter((item) => item.id !== target.id));
          setDeletingItem(null);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">No events yet.</h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Add the events TravelSentro sponsors, organizes or joins. Published events appear on
          the Events page; switch on &ldquo;Homepage&rdquo; to also show one on the homepage.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <EventRow
            key={item.id}
            item={item}
            today={today}
            onPatch={patchItem}
            onDelete={() => setDeletingItem(item)}
          />
        ))}
      </div>

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              Its photos will be removed too. &ldquo;{deletingItem?.name}&rdquo; will disappear
              from the website immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? "Deleting..." : "Delete Event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EventRow({
  item,
  today,
  onPatch,
  onDelete,
}: {
  item: EventRecord;
  today: string;
  onPatch: (id: string, patch: Partial<EventRecord>) => void;
  onDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const upcoming = isUpcoming(item, today);

  function toggle(
    field: "isPublished" | "isFeatured",
    checked: boolean,
    action: (id: string, value: boolean) => Promise<{ ok: boolean; error?: string }>
  ) {
    onPatch(item.id, { [field]: checked });
    startTransition(async () => {
      try {
        const result = await action(item.id, checked);
        if (!result.ok) {
          toast.error(result.error ?? GENERIC_ERROR_MESSAGE);
          onPatch(item.id, { [field]: !checked });
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        onPatch(item.id, { [field]: !checked });
      }
    });
  }

  const homepageSwitch = (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Switch
        checked={item.isFeatured}
        onCheckedChange={(checked) => toggle("isFeatured", checked, setEventFeatured)}
        disabled={isPending || !item.isPublished}
      />
      Homepage
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {item.coverStoragePath ? (
          // Plain <img> -- admin thumbnail, mirrors partners-list.tsx.
          <img
            src={getPublicImageUrl(item.coverStoragePath)}
            alt=""
            className="aspect-video w-28 shrink-0 rounded-md object-cover ring-1 ring-foreground/10"
          />
        ) : (
          <div className="flex aspect-video w-28 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-foreground/10">
            <ImageIcon className="size-5" />
            <span className="sr-only">No cover photo</span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-medium break-words">{item.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{EVENT_TYPE_LABELS[item.eventType]}</Badge>
            <span>{formatEventDates(item)}</span>
            <Badge variant={upcoming ? "default" : "outline"}>{upcoming ? "Upcoming" : "Past"}</Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={item.isPublished}
            onCheckedChange={(checked) => toggle("isPublished", checked, setEventPublished)}
            disabled={isPending}
          />
          Published
        </label>
        {item.isPublished ? (
          homepageSwitch
        ) : (
          <Tooltip>
            {/* A disabled switch gets no pointer events, so the tooltip hangs off a wrapper. */}
            <TooltipTrigger render={<span tabIndex={0} />}>{homepageSwitch}</TooltipTrigger>
            <TooltipContent>Publish the event first.</TooltipContent>
          </Tooltip>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/events/${item.id}`} />}
          >
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
