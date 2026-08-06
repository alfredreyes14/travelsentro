"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createSlide, updateSlide } from "@/actions/hero-slides";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import {
  heroSlideFormSchema,
  type HeroSlideFormValues,
} from "./hero-slide-form-schema";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type HeroSlidePackageOption = {
  id: string;
  name: string;
};

/**
 * Camel-cased shape of a hero_slides row, as read/mapped server-side by
 * 06-08's /admin/content page from types/database.ts's Row type.
 */
export type HeroSlideRecord = {
  id: string;
  slideType: "package" | "promo";
  packageId: string | null;
  imageStoragePath: string | null;
  headline: string | null;
  subheading: string | null;
  ctaLabel: string | null;
  externalLink: string | null;
  sortOrder: number;
};

type HeroSlideFormProps =
  | { mode: "create"; packages: HeroSlidePackageOption[]; onSuccess: () => void }
  | {
      mode: "edit";
      slide: HeroSlideRecord;
      packages: HeroSlidePackageOption[];
      onSuccess: () => void;
    };

/**
 * Renders either the create or edit hero slide form, mirroring
 * account-form.tsx's exact dual create/edit dispatch shape (each mode's own
 * self-contained sub-component). Both sub-components delegate their shared
 * field rendering to HeroSlideFormBody below.
 */
export function HeroSlideForm(props: HeroSlideFormProps) {
  if (props.mode === "create") {
    return (
      <CreateHeroSlideForm
        packages={props.packages}
        onSuccess={props.onSuccess}
      />
    );
  }

  return (
    <EditHeroSlideForm
      slide={props.slide}
      packages={props.packages}
      onSuccess={props.onSuccess}
    />
  );
}

function CreateHeroSlideForm({
  packages,
  onSuccess,
}: {
  packages: HeroSlidePackageOption[];
  onSuccess: () => void;
}) {
  return (
    <HeroSlideFormBody
      packages={packages}
      defaultValues={{
        slideType: "package",
        packageId: "",
        headline: "",
        subheading: "",
        ctaLabel: "",
        externalLink: "",
        imageStoragePath: "",
      }}
      submitLabel="Add Slide"
      onSubmit={async (values) => {
        const result = await createSlide(values);
        if (result.ok) {
          toast.success("Slide added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditHeroSlideForm({
  slide,
  packages,
  onSuccess,
}: {
  slide: HeroSlideRecord;
  packages: HeroSlidePackageOption[];
  onSuccess: () => void;
}) {
  return (
    <HeroSlideFormBody
      packages={packages}
      // slide.slideType is a widened "package" | "promo" (not a literal), so
      // this object isn't structurally a single discriminated-union member
      // from TypeScript's point of view even though it always is at runtime
      // (the discriminant always matches one of the two literals).
      defaultValues={
        {
          slideType: slide.slideType,
          packageId: slide.packageId ?? "",
          headline: slide.headline ?? "",
          subheading: slide.subheading ?? "",
          ctaLabel: slide.ctaLabel ?? "",
          externalLink: slide.externalLink ?? "",
          imageStoragePath: slide.imageStoragePath ?? "",
        } as HeroSlideFormValues
      }
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateSlide(slide.id, values);
        if (result.ok) {
          toast.success("Slide updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

/**
 * Shared field-rendering body for both create and edit modes. Both branches
 * of heroSlideFormSchema's discriminated union declare the same field names
 * (slideType/packageId/headline/subheading/ctaLabel/externalLink/
 * imageStoragePath) -- only requiredness differs per slideType -- so a
 * single useForm<HeroSlideFormValues>() call type-checks cleanly against
 * both variants without needing a separately-typed internal shape.
 */
function HeroSlideFormBody({
  defaultValues,
  packages,
  submitLabel,
  onSubmit,
}: {
  defaultValues: HeroSlideFormValues;
  packages: HeroSlidePackageOption[];
  submitLabel: string;
  onSubmit: (values: HeroSlideFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<HeroSlideFormValues>({
    resolver: zodResolver(heroSlideFormSchema),
    defaultValues,
  });

  const slideType = form.watch("slideType");

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("hero-slides", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
        toast.success("Image uploaded.");
      } else {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(values: HeroSlideFormValues) {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="slideType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slide Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a slide type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="package">Package</SelectItem>
                  <SelectItem value="promo">Promo</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {slideType === "package" ? (
          <FormField
            control={form.control}
            name="packageId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Package</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a package" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : slideType === "promo" ? (
          <>
            <FormField
              control={form.control}
              name="headline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Headline</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" placeholder="Headline" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subheading"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subheading</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Subheading" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ctaLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CTA Label</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" placeholder="e.g. Learn More" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="externalLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>External Link</FormLabel>
                  <FormControl>
                    <Input {...field} type="text" placeholder="https://..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageStoragePath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image</FormLabel>
                  <FormControl>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingImage}
                      onChange={(event) =>
                        handleImageChange(event, (storagePath) =>
                          field.onChange(storagePath)
                        )
                      }
                      className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                    />
                  </FormControl>
                  {field.value ? (
                    <p className="text-sm text-muted-foreground">
                      Image uploaded.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isUploadingImage}
          className="self-start"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
