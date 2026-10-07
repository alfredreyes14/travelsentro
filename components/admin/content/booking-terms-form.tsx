"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateBookingTerms } from "@/actions/booking-terms";
import { formatManilaDate } from "@/lib/text/format-manila-date";
import {
  bookingTermsFormSchema,
  type BookingTermsFormValues,
} from "./booking-terms-form-schema";
import { Button } from "@/components/ui/button";
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

export type BookingTermsRecord = {
  content: string;
  updatedAt: string | null;
};

/**
 * Single-document editor for the public /booking-terms page. Paragraphs are
 * plain text separated by blank lines (split by lib/text/split-paragraphs.ts
 * at render time).
 */
export function BookingTermsForm({
  initialTerms,
}: {
  initialTerms: BookingTermsRecord;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(initialTerms.updatedAt);

  const form = useForm<BookingTermsFormValues>({
    resolver: zodResolver(bookingTermsFormSchema),
    defaultValues: { content: initialTerms.content },
  });

  async function handleSubmit(values: BookingTermsFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updateBookingTerms(values.content);
      if (result.ok) {
        toast.success("Booking terms saved.");
        form.reset({ content: values.content.trim() });
        if (result.updatedAt) setUpdatedAt(result.updatedAt);
      } else {
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
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Booking Terms and Conditions</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Enter your booking terms and conditions"
                  className="min-h-96"
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                Leave a blank line between paragraphs. Shown on the public{" "}
                <Link
                  href="/booking-terms"
                  target="_blank"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Booking Terms
                </Link>{" "}
                page, linked from the site footer.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {updatedAt
              ? `Last updated ${formatManilaDate(updatedAt)}`
              : "Not saved yet"}
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting || !form.formState.isDirty}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
