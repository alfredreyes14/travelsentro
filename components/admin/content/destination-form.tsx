"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createDestination, updateDestination } from "@/actions/destinations";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import {
  destinationFormSchema,
  type DestinationFormValues,
} from "./destination-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export type DestinationRecord = {
  id: string;
  name: string;
  slug: string;
  region: "local" | "international";
  photoStoragePath: string | null;
  isActive: boolean;
  sortOrder: number;
};

type DestinationFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; destination: DestinationRecord; onSuccess: () => void };

/**
 * Renders either the create or edit destination form, mirroring
 * hero-slide-form.tsx's exact dual create/edit dispatch shape.
 */
export function DestinationForm(props: DestinationFormProps) {
  if (props.mode === "create") {
    return <CreateDestinationForm onSuccess={props.onSuccess} />;
  }

  return (
    <EditDestinationForm
      destination={props.destination}
      onSuccess={props.onSuccess}
    />
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CreateDestinationForm({ onSuccess }: { onSuccess: () => void }) {
  return (
    <DestinationFormBody
      defaultValues={{
        name: "",
        slug: "",
        region: "local",
        photoStoragePath: "",
      }}
      submitLabel="Add Destination"
      onSubmit={async (values) => {
        const result = await createDestination(values);
        if (result.ok) {
          toast.success("Destination added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditDestinationForm({
  destination,
  onSuccess,
}: {
  destination: DestinationRecord;
  onSuccess: () => void;
}) {
  return (
    <DestinationFormBody
      defaultValues={{
        name: destination.name,
        slug: destination.slug,
        region: destination.region,
        photoStoragePath: destination.photoStoragePath ?? "",
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateDestination(destination.id, values);
        if (result.ok) {
          toast.success("Destination updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function DestinationFormBody({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: DestinationFormValues;
  submitLabel: string;
  onSubmit: (values: DestinationFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues.slug));

  const form = useForm<DestinationFormValues>({
    resolver: zodResolver(destinationFormSchema),
    defaultValues,
  });

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("destinations", {
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

  async function handleSubmit(values: DestinationFormValues) {
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="Palawan"
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
                  placeholder="palawan"
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
          name="region"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Region</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="photoStoragePath"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photo (optional)</FormLabel>
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
                  Photo uploaded.
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isUploadingImage}
          className="self-end"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
