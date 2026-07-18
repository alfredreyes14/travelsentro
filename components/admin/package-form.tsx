"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
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

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const EMPTY_DEFAULTS: PackageFormValues = {
  name: "",
  slug: "",
  fromPrice: 0,
  durationDays: 0,
  durationLabel: "",
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
}: {
  packageId?: string;
  defaultValues?: Partial<PackageFormValues>;
  initialPhotos?: PhotoManagerPhoto[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="inclusions">Inclusions & FAQ</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex flex-col gap-4 pt-4">
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
          </TabsContent>

          <TabsContent value="itinerary" className="flex flex-col gap-4 pt-4">
            {itineraryArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-input p-3"
              >
                <FormField
                  control={form.control}
                  name={`itinerary.${index}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day {index + 1} Title</FormLabel>
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
                      <FormLabel>Day {index + 1} Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => itineraryArray.remove(index)}
                >
                  Remove day
                </Button>
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

          <TabsContent value="photos" className="flex flex-col gap-4 pt-4">
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

          <TabsContent value="inclusions" className="flex flex-col gap-6 pt-4">
            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Included
              </h3>
              {inclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
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
                    variant="outline"
                    size="sm"
                    onClick={() => inclusionsArray.remove(index)}
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
                    variant="outline"
                    size="sm"
                    onClick={() => exclusionsArray.remove(index)}
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
                    variant="outline"
                    size="sm"
                    onClick={() => bringItemsArray.remove(index)}
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

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-start"
        >
          {isSubmitting
            ? "Saving..."
            : packageId
              ? "Save Changes"
              : "Create Package"}
        </Button>
      </form>
    </Form>
  );
}
