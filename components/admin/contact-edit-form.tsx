"use client";

import { useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateContact } from "@/actions/crm";
import {
  ContactB2bDetailFields,
  ContactCoreFields,
  ContactRepFields,
  ContactServicesFields,
  firstErrorMessage,
} from "./contact-form-fields";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  contactFormSchema,
  type ContactFormValues,
} from "@/lib/crm/contact-schema";
import type { ClientType } from "@/lib/crm/stage";

const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Edits one contact. Shows the fields for the contact's client type; the
 * other type's values stay in `defaultValues` and are saved back unchanged.
 */
export function ContactEditForm({
  contactId,
  clientType,
  defaultValues,
  existingTags,
  onSuccess,
}: {
  contactId: string;
  clientType: ClientType;
  defaultValues: ContactFormValues;
  existingTags: string[];
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateContactId, setDuplicateContactId] = useState<string | null>(
    null
  );

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues,
  });

  async function onSubmit(values: ContactFormValues) {
    setIsSubmitting(true);
    setDuplicateContactId(null);
    try {
      const result = await updateContact(contactId, values);
      if (result.ok) {
        toast.success("Contact updated.");
        onSuccess();
      } else if (result.existingContactId) {
        form.setError("email", { message: result.error });
        setDuplicateContactId(result.existingContactId);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(CONTACT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function onInvalid(errors: FieldErrors<ContactFormValues>) {
    toast.error(firstErrorMessage(errors) ?? CONTACT_ERROR_MESSAGE);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-4"
        noValidate
      >
        <ContactCoreFields
          nameLabel={clientType === "b2b" ? "Company name" : "Name"}
          existingTags={existingTags}
          duplicateContactId={duplicateContactId}
        />

        {clientType === "b2c" ? (
          <ContactServicesFields />
        ) : (
          <>
            <ContactRepFields />
            <ContactB2bDetailFields />
          </>
        )}

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
