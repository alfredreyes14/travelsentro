"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createQuote, updateQuote } from "@/actions/quotes";
import {
  EMPTY_QUOTE_VALUES,
  quoteFormSchema,
  type QuoteFormValues,
} from "./quote-form-schema";
import type { QuoteSource } from "@/lib/quotes/quote-row";
import { useFormImport } from "./use-form-import";
import { useRemoveConfirmation } from "./itinerary-fields/remove-confirmation";
import { PricingFields } from "./itinerary-fields/pricing-fields";
import { TravelDatesFields } from "./itinerary-fields/travel-dates-fields";
import { ItineraryDaysFields } from "./itinerary-fields/itinerary-days-fields";
import { LabelListsFields } from "./itinerary-fields/label-lists-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FormActionBar } from "@/components/admin/form-action-bar";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type QuoteContactOption = { id: string; name: string; email: string };

/** Same first-errored-tab search as PackageForm's TAB_FIELD_MAP. */
const TAB_FIELD_MAP: Array<{ tab: string; fields: Array<keyof QuoteFormValues> }> = [
  {
    tab: "details",
    fields: [
      "title",
      "customerName",
      "contactId",
      "pricePerPax",
      "discountAmount",
      "durationLabel",
      "remarks",
    ],
  },
  { tab: "travel-dates", fields: ["travelDates"] },
  { tab: "itinerary", fields: ["itinerary"] },
  { tab: "inclusions", fields: ["inclusions", "exclusions", "bringItems"] },
];

/**
 * Create (no quoteId) or edit a quote. In create mode the form lives only in
 * memory until the first save, then redirects to the quote's own page;
 * imports (flyer / copy from package) arrive through PosterImportProvider
 * exactly like PackageForm's poster import, and set the quote's source.
 */
export function QuoteForm({
  quoteId,
  defaultValues,
  contacts,
}: {
  quoteId?: string;
  defaultValues?: QuoteFormValues;
  contacts: QuoteContactOption[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [origin, setOrigin] = useState<{
    source: QuoteSource;
    sourcePackageId: string | null;
  }>({ source: "manual", sourcePackageId: null });

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: defaultValues ?? EMPTY_QUOTE_VALUES,
  });

  const { requestRemove, dialog: removeDialog } = useRemoveConfirmation("quote");
  const { dialog: importDialog } = useFormImport({
    form,
    emptyValues: EMPTY_QUOTE_VALUES,
    noun: "content",
    confirmAfterImport: true,
    preserveFields: ["customerName", "contactId"],
    onApplied: (applied) => {
      setActiveTab("details");
      if (applied.origin?.source === "package") {
        setOrigin({ source: "package", sourcePackageId: applied.origin.packageId });
      } else if (applied.origin?.source === "flyer") {
        setOrigin({ source: "flyer", sourcePackageId: null });
      }
    },
  });

  const watchedContactId = useWatch({ control: form.control, name: "contactId" });
  const selectedContact = contacts.find((c) => c.id === watchedContactId) ?? null;

  async function onSubmit(values: QuoteFormValues) {
    setIsSubmitting(true);
    try {
      if (quoteId) {
        const result = await updateQuote(quoteId, values);
        if (result.ok) {
          toast.success("Quote saved.");
          form.reset(values);
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createQuote(values, origin);
        if (result.ok && result.id) {
          toast.success("Quote created.");
          // Stay disabled while navigating so a second click can't create
          // a duplicate quote.
          router.push(`/admin/quotes/${result.id}`);
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

  function onInvalid(errors: FieldErrors<QuoteFormValues>) {
    const erroredTab = TAB_FIELD_MAP.find(({ fields }) =>
      fields.some((field) => field in errors)
    );
    if (erroredTab) setActiveTab(erroredTab.tab);
    toast.error("Please fix the highlighted fields before submitting.");
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-6"
        noValidate
      >
        <Card className="gap-4 p-5 sm:p-8">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as string)}
          >
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="travel-dates">Travel Dates</TabsTrigger>
              <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
              <TabsTrigger value="inclusions">Inclusions</TabsTrigger>
            </TabsList>

            <TabsContent value="details" keepMounted className="flex flex-col gap-4 pt-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" placeholder="Coron Island Escape" />
                    </FormControl>
                    <FormDescription>Printed as the heading of the PDF.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer name (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="text" />
                    </FormControl>
                    <FormDescription>
                      For your reference only — not printed on the PDF.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        onValueChange={(contact) => {
                          field.onChange(contact?.id ?? "");
                          if (contact && !form.getValues("customerName")) {
                            form.setValue("customerName", contact.name, {
                              shouldDirty: true,
                            });
                          }
                        }}
                        itemToStringLabel={(contact: QuoteContactOption) =>
                          `${contact.name} (${contact.email})`
                        }
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
                                {(contact: QuoteContactOption) => (
                                  <ComboboxItem key={contact.id} value={contact}>
                                    {contact.name} ({contact.email})
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxPopup>
                          </ComboboxPositioner>
                        </ComboboxPortal>
                      </Combobox>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PricingFields />
            </TabsContent>

            <TabsContent value="travel-dates" keepMounted className="flex flex-col gap-4 pt-4">
              <TravelDatesFields onRequestRemove={requestRemove} />
            </TabsContent>

            <TabsContent value="itinerary" keepMounted className="flex flex-col gap-4 pt-4">
              <ItineraryDaysFields onRequestRemove={requestRemove} />
            </TabsContent>

            <TabsContent value="inclusions" keepMounted className="flex flex-col gap-6 pt-4">
              <LabelListsFields onRequestRemove={requestRemove} />
            </TabsContent>
          </Tabs>
        </Card>

        {removeDialog}
        {importDialog}

        <FormActionBar>
          {quoteId &&
            (form.formState.isDirty ? (
              <Button type="button" variant="outline" size="lg" disabled>
                Save to download PDF
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                render={<a href={`/admin/quotes/${quoteId}/pdf`} download />}
              >
                Download PDF
              </Button>
            ))}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : quoteId ? "Save Changes" : "Create Quote"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
