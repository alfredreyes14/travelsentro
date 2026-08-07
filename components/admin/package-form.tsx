"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createPackage, updatePackage } from "@/actions/packages";
import {
  packageFormSchema,
  type PackageFormValues,
} from "./package-form-schema";
import { PhotoManager, type PhotoManagerPhoto } from "./photo-manager";
import { Button } from "@/components/ui/button";
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
  slug: "",
  fromPrice: 0,
  durationDays: 0,
  durationLabel: "",
  destinationId: "",
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
  bestTimeToGo: "",
  groupSize: "",
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
  { tab: "details", fields: ["name", "slug", "fromPrice", "durationDays", "durationLabel", "destinationId"] },
  { tab: "itinerary", fields: ["itinerary"] },
  {
    tab: "inclusions",
    fields: ["inclusions", "exclusions", "bringItems", "bestTimeToGo", "groupSize"],
  },
];

/**
 * Tabbed create/edit form for a package's Details, Itinerary, Photos, and
 * Inclusions & FAQ content. `packageId` absent = create mode (submit calls
 * createPackage and redirects to the new edit page so the Photos tab has a
 * real package_id); `packageId` present = edit mode (submit calls
 * updatePackage, and the Photos tab renders the real PhotoManager).
 */
export function PackageForm({
  packageId,
  defaultValues,
  initialPhotos = [],
  destinations = [],
}: {
  packageId?: string;
  defaultValues?: Partial<PackageFormValues>;
  initialPhotos?: PhotoManagerPhoto[];
  destinations?: PackageDestinationOption[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  // Once the user hand-edits the slug, the name -> slug auto-suggestion on
  // blur stops overwriting it (still fully editable either way).
  const [slugTouched, setSlugTouched] = useState(
    Boolean(defaultValues?.slug)
  );

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
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
      if (packageId) {
        const result = await updatePackage(packageId, values);
        if (result.ok) {
          toast.success("Package saved.");
        } else {
          toast.error(result.error);
        }
        return;
      }

      const result = await createPackage(values);
      if (result.ok && result.id) {
        toast.success("Package created as a draft.");
        router.push(`/admin/packages/${result.id}`);
      } else if (!result.ok) {
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
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as string)}
        >
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="inclusions">Inclusions & FAQ</TabsTrigger>
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
                      onBlur={(event) => {
                        field.onBlur();
                        if (!slugTouched) {
                          form.setValue("slug", slugify(event.target.value), {
                            shouldValidate: true,
                          });
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="batad-rice-terraces-trek"
                      onChange={(event) => {
                        setSlugTouched(true);
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fromPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Price (PHP)</FormLabel>
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
              name="durationDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (days)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      suffix="days"
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
              name="durationLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration Label (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
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
              name="destinationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination (optional)</FormLabel>
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
            {packageId ? (
              <PhotoManager
                packageId={packageId}
                initialPhotos={initialPhotos}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Save the package details first, then add photos here.
              </p>
            )}
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
                  <span className="pb-1.5 text-sm text-muted-foreground">
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
                  <span className="pb-1.5 text-sm text-muted-foreground">
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
                  <span className="pb-1.5 text-sm text-muted-foreground">
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

            <FormField
              control={form.control}
              name="bestTimeToGo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Best Time to Go</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="groupSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group Size</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>
        </Tabs>

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
            {isSubmitting
              ? "Saving..."
              : packageId
                ? "Save Changes"
                : "Create Package"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
