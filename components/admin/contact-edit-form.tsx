"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateContact } from "@/actions/crm";
import {
  contactEditSchema,
  type ContactEditFormValues,
} from "./contact-edit-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export function ContactEditForm({
  contact,
  onSuccess,
}: {
  contact: { id: string; email: string; name: string; phone: string | null; tags: string[] };
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ContactEditFormValues>({
    resolver: zodResolver(contactEditSchema),
    defaultValues: {
      name: contact.name,
      phone: contact.phone ?? "",
      tags: contact.tags.join(", "),
    },
  });

  async function onSubmit(values: ContactEditFormValues) {
    setIsSubmitting(true);
    try {
      const tags = (values.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const result = await updateContact(contact.id, {
        name: values.name,
        phone: values.phone || null,
        tags,
      });

      if (result.ok) {
        toast.success("Contact updated.");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(CONTACT_ERROR_MESSAGE);
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
                  placeholder="Full name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-2">
          <Label htmlFor="edit-contact-email">Email</Label>
          {/* Not an RHF-managed field (no FormField wrapper) — email is the
              D-04 stable identity key and is never editable here, even by a
              can_edit_crm session. FormLabel/FormControl are intentionally
              NOT used since both require a <FormField> ancestor. */}
          <Input
            id="edit-contact-email"
            value={contact.email}
            type="email"
            disabled
            readOnly
          />
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} type="tel" autoComplete="tel" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="comma-separated, e.g. honeymoon, repeat-customer"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}
