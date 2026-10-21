"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createEvent, updateEvent } from "@/actions/events";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@/lib/events/event-type";
import {
  EVENT_IMAGE_ACCEPT,
  EVENT_IMAGE_LIMIT_MESSAGE,
  isAcceptedEventImage,
} from "@/lib/events/image-limits";
import { eventFormSchema, type EventFormValues } from "./event-form-schema";
import { useNavigationGuard } from "@/components/admin/navigation-guard";
import { FormActionBar } from "@/components/admin/form-action-bar";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const TYPE_ITEMS = EVENT_TYPES.map((type) => ({ value: type, label: EVENT_TYPE_LABELS[type] }));

export type EventRecord = {
  id: string;
  slug: string;
  name: string;
  eventType: EventType;
  startDate: string;
  endDate: string | null;
  venue: string;
  summary: string | null;
  description: string | null;
  coverStoragePath: string | null;
  linkUrl: string | null;
  isPublished: boolean;
  isFeatured: boolean;
};

function toFormValues(event?: EventRecord): EventFormValues {
  return {
    name: event?.name ?? "",
    eventType: event?.eventType ?? "booth",
    startDate: event?.startDate ?? "",
    endDate: event?.endDate ?? "",
    venue: event?.venue ?? "",
    summary: event?.summary ?? "",
    description: event?.description ?? "",
    coverStoragePath: event?.coverStoragePath ?? "",
    linkUrl: event?.linkUrl ?? "",
    isPublished: event?.isPublished ?? false,
    isFeatured: event?.isFeatured ?? false,
  };
}

/**
 * Add/edit form for one event. `event` is absent when adding; a successful
 * create moves to the edit page, where gallery photos can be added.
 */
export function EventForm({ event }: { event?: EventRecord }) {
  const router = useRouter();
  const { runGuarded } = useNavigationGuard();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: toFormValues(event),
  });

  async function handleCoverChange(
    changeEvent: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const input = changeEvent.target;
    const file = input.files?.[0];
    if (!file) return;

    // The picker's `accept` filter can be bypassed ("All files"), so the
    // type and size are checked here before anything is uploaded.
    if (!isAcceptedEventImage(file.type, file.size)) {
      toast.error(EVENT_IMAGE_LIMIT_MESSAGE);
      input.value = "";
      return;
    }

    setIsUploadingCover(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("events", {
        name: file.name,
        type: file.type,
        base64,
      });
      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
        toast.success("Cover photo uploaded.");
      } else {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsUploadingCover(false);
      input.value = "";
    }
  }

  async function onSubmit(values: EventFormValues) {
    setIsSubmitting(true);
    try {
      if (event) {
        const result = await updateEvent(event.id, values);
        if (result.ok) {
          toast.success("Event saved.");
          // The saved values become the new baseline for Cancel.
          form.reset(values);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createEvent(values);
        if (result.ok && result.id) {
          toast.success("Event created.");
          form.reset(values);
          router.push(`/admin/events/${result.id}`);
        } else {
          toast.error(result.ok ? GENERIC_ERROR_MESSAGE : result.error);
        }
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function leaveForm() {
    router.push("/admin/events");
  }

  function handleCancel() {
    if (form.formState.isDirty) {
      setIsCancelOpen(true);
      return;
    }
    runGuarded(leaveForm);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, () =>
          toast.error("Please fix the highlighted fields before saving.")
        )}
        className="flex flex-col gap-6"
        noValidate
      >
        <Card className="gap-4 p-5 sm:p-8">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} type="text" placeholder="e.g. PTAA Travel Fair 2026" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select items={TYPE_ITEMS} value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End date (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormDescription>Leave blank for a one-day event.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="venue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="e.g. SMX Convention Center, Pasay — Booth 112"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="summary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Short summary (optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormDescription>1–2 sentences, shown on event cards.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full write-up (optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={8} />
                </FormControl>
                <FormDescription>Shown on the event page. Line breaks are kept.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="coverStoragePath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cover photo</FormLabel>
                {field.value ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Plain <img> -- admin thumbnail, mirrors partner-form.tsx. */}
                    <img
                      src={getPublicImageUrl(field.value)}
                      alt=""
                      className="aspect-video w-48 rounded-md object-cover ring-1 ring-foreground/10"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange("")}
                    >
                      Remove cover
                    </Button>
                  </div>
                ) : null}
                <FormControl>
                  <input
                    type="file"
                    accept={EVENT_IMAGE_ACCEPT}
                    disabled={isUploadingCover}
                    onChange={(changeEvent) =>
                      handleCoverChange(changeEvent, (storagePath) =>
                        field.onChange(storagePath)
                      )
                    }
                    className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                  />
                </FormControl>
                <FormDescription>
                  {isUploadingCover
                    ? "Uploading..."
                    : "JPG, PNG or WebP, up to 6 MB. Required to publish."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="linkUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    inputMode="url"
                    placeholder="https://facebook.com/..."
                  />
                </FormControl>
                <FormDescription>
                  For example the Facebook post or the organizer&apos;s page.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </Card>

        <FormActionBar className="flex-wrap justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <FormField
              control={form.control}
              name="isPublished"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Published</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Show on homepage</FormLabel>
                </FormItem>
              )}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting || isUploadingCover}>
              {isSubmitting ? "Saving..." : event ? "Save Changes" : "Create Event"}
            </Button>
          </div>
        </FormActionBar>

        <AlertDialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
              <AlertDialogDescription>
                {event
                  ? "Your unsaved changes will be lost. The event stays as it was last saved."
                  : "This event hasn't been saved yet. Everything you've entered will be lost."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setIsCancelOpen(false);
                  runGuarded(leaveForm);
                }}
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </Form>
  );
}
