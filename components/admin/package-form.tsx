"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { discardDraftPackage, updatePackage } from "@/actions/packages";
import {
  packageFormSchema,
  EMPTY_DEFAULTS,
  type PackageFormValues,
} from "./package-form-schema";
import { PhotoManager, type PhotoManagerPhoto } from "./photo-manager";
import { useFormImport } from "./use-form-import";
import { useRemoveConfirmation } from "./itinerary-fields/remove-confirmation";
import { PricingFields } from "./itinerary-fields/pricing-fields";
import { TravelDatesFields } from "./itinerary-fields/travel-dates-fields";
import { ItineraryDaysFields } from "./itinerary-fields/itinerary-days-fields";
import { LabelListsFields } from "./itinerary-fields/label-lists-fields";
import { useNavigationGuard } from "./navigation-guard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormActionBar } from "@/components/admin/form-action-bar";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type PackageDestinationOption = { id: string; name: string };

/**
 * Maps each tab's string value to the PackageFormValues field names rendered
 * on it, used by onInvalid to find and switch to the first tab containing a
 * validation error. Declaration order is the search order. The "photos" tab
 * has no schema-backed fields and is intentionally excluded.
 */
const TAB_FIELD_MAP: Array<{
  tab: string;
  fields: Array<keyof PackageFormValues>;
}> = [
  {
    tab: "details",
    fields: [
      "name",
      "pricePerPax",
      "discountAmount",
      "durationLabel",
      "destinationId",
      "remarks",
    ],
  },
  { tab: "travel-dates", fields: ["travelDates"] },
  { tab: "itinerary", fields: ["itinerary"] },
  { tab: "inclusions", fields: ["inclusions", "exclusions", "bringItems"] },
];

/**
 * Tabbed edit form for a package's Details, Travel Dates, Itinerary,
 * Photos, and Inclusions content. Every package that reaches this form
 * already has a real id (see createDraftPackage in actions/packages.ts,
 * invoked as a form action from the packages list page, which creates a
 * minimal draft and redirects here) — there is no separate create mode,
 * submit always calls updatePackage. `isUnsavedDraft` changes two things:
 * Cancel discards the never-saved draft row instead of leaving it behind as
 * an "Untitled Package", and the Published/Featured switches stay disabled
 * until the first save (updatePackage enforces the same rule server-side).
 */
export function PackageForm({
  packageId,
  defaultValues,
  initialPhotos = [],
  destinations = [],
  isUnsavedDraft = false,
}: {
  packageId: string;
  defaultValues?: Partial<PackageFormValues>;
  initialPhotos?: PhotoManagerPhoto[];
  destinations?: PackageDestinationOption[];
  isUnsavedDraft?: boolean;
}) {
  const router = useRouter();
  const { runGuarded } = useNavigationGuard();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  // The isUnsavedDraft prop is fixed at page render, so a successful save
  // here has to clear it -- otherwise Cancel would discard a package the
  // admin just saved.
  const [isDraft, setIsDraft] = useState(isUnsavedDraft);

  // Base UI's <SelectValue> renders the raw value unless the root is given an
  // items map, which would show the destination's UUID in the trigger.
  const destinationItems = useMemo(
    () => destinations.map(({ id, name }) => ({ value: id, label: name })),
    [destinations]
  );

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const { requestRemove, dialog: removeDialog } =
    useRemoveConfirmation("package");
  const { dialog: importDialog } = useFormImport({
    form,
    emptyValues: EMPTY_DEFAULTS,
    noun: "poster",
    onApplied: () => setActiveTab("details"),
    // A poster has no publish/feature state of its own -- keep whatever the
    // admin already set instead of resetting both to EMPTY_DEFAULTS' false.
    preserveFields: ["isPublished", "isFeatured"],
  });

  async function onSubmit(values: PackageFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updatePackage(packageId, values);
      if (result.ok) {
        toast.success("Package saved.");
        setIsDraft(false);
        // Make the saved values the new baseline so Cancel only asks about
        // changes made after this save.
        form.reset(values);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function onInvalid(errors: FieldErrors<PackageFormValues>) {
    const erroredTab = TAB_FIELD_MAP.find(({ fields }) =>
      fields.some((field) => field in errors)
    );
    if (erroredTab) {
      setActiveTab(erroredTab.tab);
    }
    toast.error("Please fix the highlighted fields before submitting.");
  }

  async function leaveForm() {
    setIsLeaving(true);
    try {
      if (isDraft) {
        const result = await discardDraftPackage(packageId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }
      router.push("/admin/packages");
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsLeaving(false);
    }
  }

  function handleCancel() {
    if (form.formState.isDirty) {
      setIsCancelOpen(true);
      return;
    }
    // Still routed through the guard so a running poster extraction gets
    // the same "leave anyway?" prompt as the sidebar nav.
    runGuarded(leaveForm);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-6"
        noValidate
      >
        <Card className="gap-4 p-5 sm:p-8">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as string)}
        >
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="travel-dates">Travel Dates</TabsTrigger>
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="inclusions">Inclusions</TabsTrigger>
          </TabsList>

          <TabsContent
            value="details"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="Batad Rice Terraces Trek"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="destinationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination</FormLabel>
                  <Select
                    items={destinationItems}
                    value={field.value || ""}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a destination" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {destinations.map((destination) => (
                        <SelectItem key={destination.id} value={destination.id}>
                          {destination.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PricingFields />
          </TabsContent>

          <TabsContent
            value="travel-dates"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            <TravelDatesFields onRequestRemove={requestRemove} />
          </TabsContent>

          <TabsContent
            value="itinerary"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            <ItineraryDaysFields onRequestRemove={requestRemove} />
          </TabsContent>

          <TabsContent
            value="photos"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            <PhotoManager packageId={packageId} initialPhotos={initialPhotos} />
          </TabsContent>

          <TabsContent
            value="inclusions"
            keepMounted
            className="flex flex-col gap-6 pt-4"
          >
            <LabelListsFields onRequestRemove={requestRemove} />
          </TabsContent>
        </Tabs>
        </Card>

        {removeDialog}
        {importDialog}

        <FormActionBar className="flex-wrap justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <FormField
              control={form.control}
              name="isPublished"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isDraft}
                    />
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
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isDraft}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Featured</FormLabel>
                </FormItem>
              )}
            />
            {isDraft ? (
              <p className="text-sm text-muted-foreground">
                Save the package first to publish or feature it.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting || isLeaving}
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting || isLeaving}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </FormActionBar>

        <AlertDialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isDraft ? "Discard this package?" : "Discard your changes?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isDraft
                  ? "This package hasn't been saved yet. Everything you've entered will be lost."
                  : "Your unsaved changes will be lost. The package stays as it was last saved."}
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
