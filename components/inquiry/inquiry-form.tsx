"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

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
                  autoComplete="name"
                  placeholder="Your full name"
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
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="tel"
                  autoComplete="tel"
                  placeholder="09XX XXX XXXX"
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
              <FormLabel>Message</FormLabel>
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
          className="self-start"
        >
          {isSubmitting ? "Sending..." : "Send Inquiry"}
        </Button>
      </form>
    </Form>
  );
}
