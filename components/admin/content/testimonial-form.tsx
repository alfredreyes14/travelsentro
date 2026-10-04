"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { createTestimonial, updateTestimonial } from "@/actions/testimonials";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import {
  MAX_TESTIMONIAL_PHOTOS,
  testimonialFormSchema,
  type TestimonialFormValues,
} from "./testimonial-form-schema";
import { StarRatingInput } from "./star-rating-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export type TestimonialRecord = {
  id: string;
  customerName: string;
  quote: string;
  rating: number;
  photoStoragePaths: string[];
};

type TestimonialFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; testimonial: TestimonialRecord; onSuccess: () => void };

/**
 * Renders either the create or edit testimonial form, mirroring
 * value-prop-form.tsx's dual create/edit dispatch shape combined with
 * hero-slide-form.tsx's immediate pre-submit image-upload pattern.
 */
export function TestimonialForm(props: TestimonialFormProps) {
  if (props.mode === "create") {
    return <CreateTestimonialForm onSuccess={props.onSuccess} />;
  }

  return (
    <EditTestimonialForm
      testimonial={props.testimonial}
      onSuccess={props.onSuccess}
    />
  );
}

function CreateTestimonialForm({ onSuccess }: { onSuccess: () => void }) {
  return (
    <TestimonialFormBody
      defaultValues={{
        customerName: "",
        quote: "",
        rating: 0,
        photoStoragePaths: [],
      }}
      submitLabel="Add Testimonial"
      onSubmit={async (values) => {
        const result = await createTestimonial(values);
        if (result.ok) {
          toast.success("Testimonial added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditTestimonialForm({
  testimonial,
  onSuccess,
}: {
  testimonial: TestimonialRecord;
  onSuccess: () => void;
}) {
  return (
    <TestimonialFormBody
      defaultValues={{
        customerName: testimonial.customerName,
        quote: testimonial.quote,
        rating: testimonial.rating,
        photoStoragePaths: testimonial.photoStoragePaths,
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateTestimonial(testimonial.id, values);
        if (result.ok) {
          toast.success("Testimonial updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function TestimonialFormBody({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: TestimonialFormValues;
  submitLabel: string;
  onSubmit: (values: TestimonialFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<TestimonialFormValues>({
    resolver: zodResolver(testimonialFormSchema),
    defaultValues,
  });

  /**
   * Uploads every selected file, one Server Action call at a time, and
   * appends each successful upload's key as it lands -- mirroring
   * photo-manager.tsx, a failure partway through keeps the photos that
   * already uploaded instead of discarding the whole selection. Files
   * beyond MAX_TESTIMONIAL_PHOTOS are skipped up front rather than
   * uploaded and then rejected by the schema on submit.
   */
  async function handlePhotosSelected(
    event: ChangeEvent<HTMLInputElement>,
    currentPaths: string[],
    onChange: (paths: string[]) => void
  ) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) return;

    const remainingSlots = MAX_TESTIMONIAL_PHOTOS - currentPaths.length;
    const files = selected.slice(0, Math.max(remainingSlots, 0));
    if (files.length < selected.length) {
      toast.error(
        `Only ${MAX_TESTIMONIAL_PHOTOS} photos are allowed per testimonial -- ${selected.length - files.length} skipped.`
      );
    }

    setIsUploadingImage(true);
    let paths = currentPaths;
    let succeededCount = 0;
    try {
      for (const file of files) {
        try {
          const base64 = await readFileAsBase64(file);
          const result = await uploadSiteContentImage("testimonials", {
            name: file.name,
            type: file.type,
            base64,
          });
          if (result.ok && result.storagePath) {
            paths = [...paths, result.storagePath];
            onChange(paths);
            succeededCount += 1;
          } else {
            toast.error(result.ok ? GENERIC_ERROR_MESSAGE : result.error);
          }
        } catch {
          toast.error(GENERIC_ERROR_MESSAGE);
        }
      }

      if (succeededCount > 0) {
        toast.success(
          succeededCount === 1
            ? "Photo uploaded."
            : `${succeededCount} photos uploaded.`
        );
      }
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(values: TestimonialFormValues) {
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
          name="customerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Customer Name</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="Customer name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quote</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Quote" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rating</FormLabel>
              <FormControl>
                <StarRatingInput value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="photoStoragePaths"
          render={({ field }) => {
            const isFull = field.value.length >= MAX_TESTIMONIAL_PHOTOS;

            return (
              <FormItem>
                <FormLabel>
                  Photos (optional, up to {MAX_TESTIMONIAL_PHOTOS})
                </FormLabel>
                {field.value.length > 0 ? (
                  <ul className="grid grid-cols-4 gap-2">
                    {field.value.map((storagePath, index) => (
                      <li
                        key={storagePath}
                        className="relative aspect-square overflow-hidden rounded-md bg-secondary/10"
                      >
                        {/* Plain <img>, matching hero-slides-list.tsx's
                            admin thumbnail convention. */}
                        <img
                          src={getPublicImageUrl(storagePath)}
                          alt={`Photo ${index + 1}`}
                          className="size-full object-cover"
                        />
                        {/* Removing only drops the key from the form; the
                            R2 object is left in place so cancelling an edit
                            never breaks the saved testimonial (orphaning is
                            the accepted scope limit noted in
                            site-content-uploads.ts). */}
                        <button
                          type="button"
                          onClick={() =>
                            field.onChange(
                              field.value.filter((path) => path !== storagePath)
                            )
                          }
                          disabled={isUploadingImage}
                          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-50"
                        >
                          <XIcon className="size-3.5" />
                          <span className="sr-only">Remove photo {index + 1}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <FormControl>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isUploadingImage || isFull}
                    onChange={(event) =>
                      handlePhotosSelected(event, field.value, field.onChange)
                    }
                    className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:opacity-50"
                  />
                </FormControl>
                <p className="text-sm text-muted-foreground">
                  {isUploadingImage
                    ? "Uploading..."
                    : `${field.value.length} of ${MAX_TESTIMONIAL_PHOTOS} photos`}
                </p>
                <FormMessage />
              </FormItem>
            );
          }}
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
