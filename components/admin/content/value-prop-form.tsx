"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createValueProp, updateValueProp } from "@/actions/value-props";
import {
  valuePropFormSchema,
  type ValuePropFormValues,
} from "./value-prop-form-schema";
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

export type ValuePropRecord = {
  id: string;
  title: string;
  description: string;
};

type ValuePropFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; valueProp: ValuePropRecord; onSuccess: () => void };

/**
 * Renders either the create or edit value prop form, mirroring
 * account-form.tsx's exact dual create/edit dispatch shape.
 */
export function ValuePropForm(props: ValuePropFormProps) {
  if (props.mode === "create") {
    return <CreateValuePropForm onSuccess={props.onSuccess} />;
  }

  return (
    <EditValuePropForm
      valueProp={props.valueProp}
      onSuccess={props.onSuccess}
    />
  );
}

function CreateValuePropForm({ onSuccess }: { onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ValuePropFormValues>({
    resolver: zodResolver(valuePropFormSchema),
    defaultValues: { title: "", description: "" },
  });

  async function onSubmit(values: ValuePropFormValues) {
    setIsSubmitting(true);
    try {
      const result = await createValueProp(values);
      if (result.ok) {
        toast.success("Value prop added.");
        form.reset();
        onSuccess();
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
    <ValuePropFormBody
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Add Value Prop"
    />
  );
}

function EditValuePropForm({
  valueProp,
  onSuccess,
}: {
  valueProp: ValuePropRecord;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ValuePropFormValues>({
    resolver: zodResolver(valuePropFormSchema),
    defaultValues: {
      title: valueProp.title,
      description: valueProp.description,
    },
  });

  async function onSubmit(values: ValuePropFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updateValueProp(valueProp.id, values);
      if (result.ok) {
        toast.success("Value prop updated.");
        onSuccess();
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
    <ValuePropFormBody
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Save Changes"
    />
  );
}

function ValuePropFormBody({
  form,
  onSubmit,
  isSubmitting,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<ValuePropFormValues>>;
  onSubmit: (values: ValuePropFormValues) => Promise<void>;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="Title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-start"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
