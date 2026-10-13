"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createContact } from "@/actions/crm";
import {
  ContactCoreFields,
  ContactRepFields,
  firstErrorMessage,
} from "./contact-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import {
  EMPTY_CONTACT_VALUES,
  contactFormSchema,
  type ContactFormValues,
} from "@/lib/crm/contact-schema";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  type ClientType,
} from "@/lib/crm/stage";

const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const TYPE_DESCRIPTIONS: Record<ClientType, string> = {
  b2c: "An individual traveller",
  b2b: "A company or partner",
};

function AddContactForm({
  defaultType,
  existingTags,
}: {
  defaultType: ClientType;
  existingTags: string[];
}) {
  const router = useRouter();
  const [clientType, setClientType] = useState<ClientType>(defaultType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateContactId, setDuplicateContactId] = useState<string | null>(
    null
  );

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: EMPTY_CONTACT_VALUES,
  });

  async function onSubmit(values: ContactFormValues) {
    setIsSubmitting(true);
    setDuplicateContactId(null);
    try {
      const result = await createContact(clientType, values);
      if (result.ok) {
        toast.success("Contact added.");
        // The rest of the fields are filled in on the contact's own page.
        router.push(`/admin/crm/${result.id}`);
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

  // A validation error on one tag among several has no field on screen to
  // show it, so without this Add Contact would do nothing, silently.
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
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Client type"
        >
          {CLIENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={clientType === type}
              onClick={() => setClientType(type)}
              className={
                clientType === type
                  ? "rounded-lg border border-primary bg-primary/5 p-3 text-left"
                  : "rounded-lg border border-border p-3 text-left hover:bg-muted/50"
              }
            >
              <span className="block text-sm font-semibold">
                {CLIENT_TYPE_LABELS[type]}
              </span>
              <span className="block text-sm text-muted-foreground">
                {TYPE_DESCRIPTIONS[type]}
              </span>
            </button>
          ))}
        </div>

        <ContactCoreFields
          nameLabel={clientType === "b2b" ? "Company name" : "Name"}
          existingTags={existingTags}
          duplicateContactId={duplicateContactId}
        />

        {clientType === "b2b" ? <ContactRepFields /> : null}

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Adding..." : "Add Contact"}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Adds a B2C or B2B contact by hand. The form is a child component so it
 * mounts fresh (empty fields, the current tab's type) every time the
 * dialog opens.
 */
export function ContactAddDialog({
  open,
  onOpenChange,
  defaultType,
  existingTags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: ClientType;
  existingTags: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            An email or a phone number is required.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AddContactForm defaultType={defaultType} existingTags={existingTags} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
