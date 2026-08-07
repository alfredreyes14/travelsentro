"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { inquirySchema, type InquiryFormValues } from "./inquiry-schema";
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

// Touch-friendly sizing (44px min) for this form specifically — the shared
// Input/Button primitives default shorter (h-8/h-9) for density-first admin
// UI, so override here rather than raising the shared default everywhere.
const FIELD_HEIGHT = "h-11 px-3";

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

const GENERIC_ERROR_MESSAGE =
  "Something went wrong sending your inquiry. Please try again, or reach us directly on WhatsApp or Facebook.";

export function InquiryForm({
  packageName,
  packageId,
}: {
  packageName?: string;
  packageId?: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Stable across a rapid double-click (only rotated after a successful
  // submit, below) so record_inquiry()'s request_id-keyed dedup actually
  // catches near-simultaneous duplicate submit attempts (D-03).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      _gotcha: "",
    },
  });

  async function onSubmit(values: InquiryFormValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, ...values, packageId, packageName }),
      });
      const result = await res.json();

      if (res.ok && result.ok) {
        toast.success("Inquiry sent! We'll get back to you soon.");
        form.reset();
        setRequestId(crypto.randomUUID());
      } else {
        toast.error(GENERIC_ERROR_MESSAGE);
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
        className="flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm"
        noValidate
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Name <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    className={FIELD_HEIGHT}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Email <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={FIELD_HEIGHT}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Phone <RequiredMark />
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="tel"
                  autoComplete="tel"
                  placeholder="09XX XXX XXXX"
                  className={FIELD_HEIGHT}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Message <RequiredMark />
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={4}
                  placeholder={
                    packageName
                      ? `Tell us more about your trip — dates, group size, questions about ${packageName}...`
                      : "Tell us how we can help..."
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Honeypot — visually hidden (not display:none, per Formspree's own
            recommendation), left empty by real users, silently discarded by
            Formspree when filled by bots. */}
        <FormField
          control={form.control}
          name="_gotcha"
          render={({ field }) => (
            <FormItem className="sr-only">
              <FormLabel>Leave this field empty</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-11 w-full sm:w-auto sm:self-end"
        >
          {isSubmitting && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {isSubmitting ? "Sending..." : "Send Inquiry"}
        </Button>
      </form>
    </Form>
  );
}
