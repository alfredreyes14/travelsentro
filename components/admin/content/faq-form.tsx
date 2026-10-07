"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createFaq, updateFaq } from "@/actions/faqs";
import {
  faqFormSchema,
  type FaqFormValues,
} from "./faq-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

export type FaqRecord = {
  id: string;
  question: string;
  answer: string;
  isPublished: boolean;
};

type FaqFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; faq: FaqRecord; onSuccess: () => void };

/**
 * Renders either the create or edit FAQ form, mirroring
 * testimonial-form.tsx's dual create/edit dispatch shape.
 */
export function FaqForm(props: FaqFormProps) {
  if (props.mode === "create") {
    return <CreateFaqForm onSuccess={props.onSuccess} />;
  }

  return <EditFaqForm faq={props.faq} onSuccess={props.onSuccess} />;
}

function CreateFaqForm({ onSuccess }: { onSuccess: () => void }) {
  return (
    <FaqFormBody
      defaultValues={{ question: "", answer: "", isPublished: true }}
      submitLabel="Add FAQ"
      onSubmit={async (values) => {
        const result = await createFaq(values);
        if (result.ok) {
          toast.success("FAQ added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditFaqForm({
  faq,
  onSuccess,
}: {
  faq: FaqRecord;
  onSuccess: () => void;
}) {
  return (
    <FaqFormBody
      defaultValues={{
        question: faq.question,
        answer: faq.answer,
        isPublished: faq.isPublished,
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateFaq(faq.id, values);
        if (result.ok) {
          toast.success("FAQ updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function FaqFormBody({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: FaqFormValues;
  submitLabel: string;
  onSubmit: (values: FaqFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FaqFormValues>({
    resolver: zodResolver(faqFormSchema),
    defaultValues,
  });

  async function handleSubmit(values: FaqFormValues) {
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
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="e.g. Do your packages include airfare?"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="answer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Answer</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Answer" className="min-h-32" />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                Line breaks are kept on the public page.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isPublished"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
              <FormLabel className="cursor-pointer">
                Show on public FAQ page
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
