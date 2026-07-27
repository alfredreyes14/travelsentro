"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createTestimonial, updateTestimonial } from "@/actions/testimonials";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import {
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
  photoStoragePath: string | null;
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
        photoStoragePath: "",
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
        photoStoragePath: testimonial.photoStoragePath ?? "",
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

  async function handlePhotoChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("testimonials", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
        toast.success("Photo uploaded.");
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
                    handlePhotoChange(event, (storagePath) =>
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
          className="self-start"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
