"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createSoa, updateSoa } from "@/actions/soa";
import {
  emptySoaValues,
  soaFormSchema,
  todayInManila,
  type SoaFormValues,
} from "./soa-form-schema";
import {
  SoaDiscountsFields,
  SoaLineItemsFields,
  SoaPaymentsFields,
  SoaSummary,
} from "./soa-fields";
import { contactLabel } from "@/lib/crm/contact-label";
import type { SoaContactOption, SoaVoucherOption } from "@/lib/soa/soa-options";
import { useRemoveConfirmation } from "@/components/admin/itinerary-fields/remove-confirmation";
import { FormActionBar } from "@/components/admin/form-action-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4 p-5 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

/**
 * Create (no soaId) or edit a Statement of Account. Create mode lives in
 * memory until the first save, then redirects to the SOA's own page where
 * the PDF can be downloaded (same flow as QuoteForm).
 */
export function SoaForm({
  soaId,
  defaultValues,
  contacts,
  vouchers,
}: {
  soaId?: string;
  defaultValues?: SoaFormValues;
  contacts: SoaContactOption[];
  vouchers: SoaVoucherOption[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SoaFormValues>({
    resolver: zodResolver(soaFormSchema),
    defaultValues: defaultValues ?? emptySoaValues(),
  });

  const { requestRemove, dialog: removeDialog } = useRemoveConfirmation("statement");

  const watchedContactId = useWatch({ control: form.control, name: "contactId" });
  const selectedContact = contacts.find((c) => c.id === watchedContactId) ?? null;

  async function onSubmit(values: SoaFormValues) {
    setIsSubmitting(true);
    try {
      if (soaId) {
        const result = await updateSoa(soaId, values);
        if (result.ok) {
          toast.success("Statement saved.");
          form.reset(values);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createSoa(values);
        if (result.ok && result.id) {
          toast.success("Statement created.");
          // Stay disabled while navigating so a second click can't create a duplicate.
          router.push(`/admin/soa/${result.id}`);
          return;
        } else if (!result.ok) {
          toast.error(result.error);
        }
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, () =>
          toast.error("Please fix the highlighted fields before saving.")
        )}
        className="flex flex-col gap-6"
        noValidate
      >
        <Section title="Bill to">
          <FormField
            control={form.control}
            name="contactId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CRM contact (optional)</FormLabel>
                <FormControl>
                  <Combobox
                    items={contacts}
                    value={selectedContact}
                    onValueChange={(contact: SoaContactOption | null) => {
                      field.onChange(contact?.id ?? "");
                      if (!contact) return;
                      const opts = { shouldDirty: true };
                      if (!form.getValues("billToName")) {
                        form.setValue("billToName", contact.name, opts);
                      }
                      if (!form.getValues("billToDetails")) {
                        const details = [contact.email, contact.phone].filter(Boolean).join("\n");
                        form.setValue("billToDetails", details, opts);
                      }
                    }}
                    itemToStringLabel={(contact: SoaContactOption) => contactLabel(contact)}
                  >
                    <ComboboxInputGroup>
                      <ComboboxInput placeholder="Not linked..." />
                      {selectedContact ? <ComboboxClear /> : <ComboboxTrigger />}
                    </ComboboxInputGroup>
                    <ComboboxPortal>
                      <ComboboxPositioner>
                        <ComboboxPopup>
                          <ComboboxEmpty>No contacts found.</ComboboxEmpty>
                          <ComboboxList>
                            {(contact: SoaContactOption) => (
                              <ComboboxItem key={contact.id} value={contact}>
                                {contactLabel(contact)}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxPopup>
                      </ComboboxPositioner>
                    </ComboboxPortal>
                  </Combobox>
                </FormControl>
                <FormDescription>Fills in the name and details below.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billToName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} type="text" placeholder="Maria Santos / ABC Corp." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billToDetails"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address / contact details (optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="text"
                    placeholder="Coron trip, Dec 20–22 · Quote TSQ-000012"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="issueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statement date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Section>

        <Section title="Line items" description="Add anything you're billing for.">
          <SoaLineItemsFields onRequestRemove={requestRemove} />
        </Section>

        <Section
          title="Discounts & vouchers"
          description="Percent discounts are taken from the subtotal. Discounts never bring the total below ₱0."
        >
          <SoaDiscountsFields vouchers={vouchers} onRequestRemove={requestRemove} />
        </Section>

        <Section title="Payments received" description="Deducted from the total to get the balance due.">
          <SoaPaymentsFields onRequestRemove={requestRemove} defaultDate={todayInManila} />
        </Section>

        <Section title="Notes" description="e.g. bank / GCash details and payment terms. Printed at the bottom.">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={4} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section title="Summary">
          <SoaSummary />
        </Section>

        {removeDialog}

        <FormActionBar>
          {soaId &&
            (form.formState.isDirty ? (
              <Button type="button" variant="outline" size="lg" disabled>
                Save to download PDF
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                render={<a href={`/admin/soa/${soaId}/pdf`} download />}
              >
                Download PDF
              </Button>
            ))}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : soaId ? "Save Changes" : "Create Statement"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
