"use client";

import { useState } from "react";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updatePackage } from "@/actions/packages";
import {
  packageFormSchema,
  type PackageFormValues,
} from "./package-form-schema";
import { PhotoManager, type PhotoManagerPhoto } from "./photo-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { FormActionBar } from "@/components/admin/form-action-bar";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type PackageDestinationOption = { id: string; name: string };

const EMPTY_DEFAULTS: PackageFormValues = {
  name: "",
  pricePerPax: 0,
  discountAmount: undefined,
  durationLabel: "",
  destinationId: "",
  remarks: "",
  travelDates: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
};

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
 * submit always calls updatePackage.
 */
export function PackageForm({
  packageId,
  defaultValues,
  initialPhotos = [],
  destinations = [],
}: {
  packageId: string;
  defaultValues?: Partial<PackageFormValues>;
  initialPhotos?: PhotoManagerPhoto[];
  destinations?: PackageDestinationOption[];
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const travelDatesArray = useFieldArray({
    control: form.control,
    name: "travelDates",
  });
  const itineraryArray = useFieldArray({
    control: form.control,
    name: "itinerary",
  });
  const inclusionsArray = useFieldArray({
    control: form.control,
    name: "inclusions",
  });
  const exclusionsArray = useFieldArray({
    control: form.control,
    name: "exclusions",
  });
  const bringItemsArray = useFieldArray({
    control: form.control,
    name: "bringItems",
  });

  const [pendingRemoval, setPendingRemoval] = useState<{
    label: string;
    onConfirm: () => void;
  } | null>(null);

  function requestRemove(
    hasContent: boolean,
    label: string,
    onConfirm: () => void
  ) {
    if (hasContent) {
      setPendingRemoval({ label, onConfirm });
    } else {
      onConfirm();
    }
  }

  async function onSubmit(values: PackageFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updatePackage(packageId, values);
      if (result.ok) {
        toast.success("Package saved.");
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
                  <Select value={field.value || ""} onValueChange={field.onChange}>
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

            <FormField
              control={form.control}
              name="pricePerPax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per pax (PHP)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      prefix="₱"
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="discountAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount (PHP, optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={1}
                      prefix="₱"
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? undefined
                            : event.target.valueAsNumber
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    A fixed amount off the price per pax.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="3 days, 2 nights"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent
            value="travel-dates"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            {travelDatesArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-[16px] leading-[1.2] font-semibold">
                    Date {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(
                          form.getValues(`travelDates.${index}.date`) ||
                            form.getValues(`travelDates.${index}.additionalFee`)
                        ),
                        `Date ${index + 1}`,
                        () => travelDatesArray.remove(index)
                      )
                    }
                  >
                    Remove date
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.date`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.additionalFee`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional fee (optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="number"
                          min={1}
                          prefix="₱"
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === ""
                                ? undefined
                                : event.target.valueAsNumber
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        e.g. a peak-season surcharge for this date.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                travelDatesArray.append({ date: "", additionalFee: undefined })
              }
            >
              Add travel date
            </Button>
            {form.formState.errors.travelDates?.message ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.travelDates.message}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent
            value="itinerary"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            {itineraryArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-[16px] leading-[1.2] font-semibold">
                    Day {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(
                          form.getValues(`itinerary.${index}.title`) ||
                            form.getValues(`itinerary.${index}.description`)
                        ),
                        `Day ${index + 1}`,
                        () => itineraryArray.remove(index)
                      )
                    }
                  >
                    Remove day
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`itinerary.${index}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} type="text" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`itinerary.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                itineraryArray.append({ title: "", description: "" })
              }
            >
              Add day
            </Button>
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
            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Included
              </h3>
              {inclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pt-2 self-start text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`inclusions.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(form.getValues(`inclusions.${index}.label`)),
                        `Included item ${index + 1}`,
                        () => inclusionsArray.remove(index)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => inclusionsArray.append({ label: "" })}
              >
                Add included item
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Excluded
              </h3>
              {exclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pt-2 self-start text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`exclusions.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(form.getValues(`exclusions.${index}.label`)),
                        `Excluded item ${index + 1}`,
                        () => exclusionsArray.remove(index)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => exclusionsArray.append({ label: "" })}
              >
                Add excluded item
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                What to Bring
              </h3>
              {bringItemsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pt-2 self-start text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`bringItems.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(form.getValues(`bringItems.${index}.label`)),
                        `Item to bring ${index + 1}`,
                        () => bringItemsArray.remove(index)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => bringItemsArray.append({ label: "" })}
              >
                Add item to bring
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        </Card>

        <AlertDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => !open && setPendingRemoval(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {pendingRemoval?.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete its content. This can&apos;t be undone once
                you save the package.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  pendingRemoval?.onConfirm();
                  setPendingRemoval(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FormActionBar>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
