"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { PlusIcon } from "lucide-react";

import { ContactAddDialog } from "@/components/admin/contact-add-dialog";
import { FormActionBar } from "@/components/admin/form-action-bar";
import { SoaSendDialog } from "./soa-send-dialog";
import { contactLabel } from "@/lib/crm/contact-label";
import { CLIENT_TYPE_LABELS } from "@/lib/crm/stage";
import type { SoaContactOption, SoaQuoteOption } from "@/lib/soa/soa-options";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
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

/** The fields both kinds of SOA share. */
type SoaHeaderValues = {
  billToName: string;
  billToDetails?: string;
  contactId?: string;
  quoteId?: string;
  issueDate: string;
  dueDate?: string;
  remarks?: string;
};

/**
 * Dialogs with their own <form> render inside the SOA <form>. They are
 * portaled out of it in the DOM, but React still bubbles their submit
 * event up to the SOA form's onSubmit -- this stops it on the way.
 */
function StopSubmit({ children }: { children: React.ReactNode }) {
  return <div className="contents" onSubmit={(event) => event.stopPropagation()}>{children}</div>;
}

export function SoaSection({
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

function optionLabel(contact: SoaContactOption): string {
  return `${contactLabel(contact)} · ${CLIENT_TYPE_LABELS[contact.clientType]}`;
}

function quoteOptionLabel(quote: SoaQuoteOption): string {
  return `${quote.quoteNo} · ${quote.title}${quote.customerName ? ` · ${quote.customerName}` : ""}`;
}

/**
 * Who the SOA is for. Linking a CRM contact (B2C or B2B) is optional: an
 * SOA can be saved with just a name and linked later from the contact's
 * page. Staff who can edit the CRM can also add the customer as a new
 * contact right here.
 */
export function SoaBillToFields({
  contacts: initialContacts,
  quotes,
  existingTags,
  canCreateContact,
}: {
  contacts: SoaContactOption[];
  quotes: SoaQuoteOption[];
  existingTags: string[];
  canCreateContact: boolean;
}) {
  const form = useFormContext<SoaHeaderValues>();
  const [contacts, setContacts] = useState(initialContacts);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const contactId = useWatch({ control: form.control, name: "contactId" });
  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;

  const quoteId = useWatch({ control: form.control, name: "quoteId" });
  const selectedQuote = quotes.find((q) => q.id === quoteId) ?? null;
  // The linked contact's quotes first, then the rest.
  const sortedQuotes = contactId
    ? [...quotes].sort(
        (a, b) => Number(b.contactId === contactId) - Number(a.contactId === contactId)
      )
    : quotes;

  /** Links a quote, filling in blanks (contact, name) from it. */
  function selectQuote(quote: SoaQuoteOption | null) {
    const opts = { shouldDirty: true };
    form.setValue("quoteId", quote?.id ?? "", opts);
    if (!quote) return;
    if (!form.getValues("contactId") && quote.contactId) {
      selectContact(contacts.find((c) => c.id === quote.contactId) ?? null);
    }
    if (!form.getValues("billToName") && quote.customerName) {
      form.setValue("billToName", quote.customerName, opts);
    }
  }

  function selectContact(contact: SoaContactOption | null) {
    const opts = { shouldDirty: true };
    form.setValue("contactId", contact?.id ?? "", opts);
    if (!contact) return;
    if (!form.getValues("billToName")) form.setValue("billToName", contact.name, opts);
    if (!form.getValues("billToDetails")) {
      form.setValue(
        "billToDetails",
        [contact.email, contact.phone].filter(Boolean).join("\n"),
        opts
      );
    }
  }

  return (
    <>
      <FormItem>
        <FormLabel>CRM contact (optional)</FormLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Combobox
            items={contacts}
            value={selectedContact}
            onValueChange={(contact: SoaContactOption | null) => selectContact(contact)}
            itemToStringLabel={optionLabel}
          >
            <ComboboxInputGroup className="flex-1">
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
                        {optionLabel(contact)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxPopup>
              </ComboboxPositioner>
            </ComboboxPortal>
          </Combobox>
          {canCreateContact ? (
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(true)}>
              <PlusIcon className="size-4" />
              New contact
            </Button>
          ) : null}
        </div>
        <FormDescription>
          {canCreateContact
            ? "Not in the CRM yet? Add them as a new contact, or save without one and link it later from the contact's page."
            : "Not in the CRM yet? Save without a contact and link it later from the contact's page."}
        </FormDescription>
      </FormItem>

      <StopSubmit>
      <ContactAddDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        defaultType="b2c"
        existingTags={existingTags}
        onCreated={(created) => {
          const option: SoaContactOption = created;
          setContacts((current) =>
            [...current, option].sort((a, b) => a.name.localeCompare(b.name))
          );
          selectContact(option);
          setIsAddOpen(false);
        }}
      />
      </StopSubmit>

      {quotes.length > 0 ? (
        <FormItem>
          <FormLabel>Quote (optional)</FormLabel>
          <Combobox
            items={sortedQuotes}
            value={selectedQuote}
            onValueChange={(quote: SoaQuoteOption | null) => selectQuote(quote)}
            itemToStringLabel={quoteOptionLabel}
          >
            <ComboboxInputGroup>
              <ComboboxInput placeholder="Not linked..." />
              {selectedQuote ? <ComboboxClear /> : <ComboboxTrigger />}
            </ComboboxInputGroup>
            <ComboboxPortal>
              <ComboboxPositioner>
                <ComboboxPopup>
                  <ComboboxEmpty>No quotes found.</ComboboxEmpty>
                  <ComboboxList>
                    {(quote: SoaQuoteOption) => (
                      <ComboboxItem key={quote.id} value={quote}>
                        {quoteOptionLabel(quote)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxPopup>
              </ComboboxPositioner>
            </ComboboxPortal>
          </Combobox>
          <FormDescription>
            The quote this SOA bills for. Its number prints on the SOA.
          </FormDescription>
        </FormItem>
      ) : null}

      <FormField
        control={form.control}
        name="billToName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Bill to</FormLabel>
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
    </>
  );
}

export function SoaRemarksField({ label }: { label?: string }) {
  const form = useFormContext<SoaHeaderValues>();
  return (
    <FormField
      control={form.control}
      name="remarks"
      render={({ field }) => (
        <FormItem>
          {label ? <FormLabel>{label}</FormLabel> : null}
          <FormControl>
            <Textarea {...field} value={field.value ?? ""} rows={4} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export type SoaEmailDefaults = {
  soaNo: string;
  originalNo: string | null;
  billToName: string;
  contactEmail: string | null;
};

/**
 * Save, plus View / Download / Email once the SOA exists. Those three act
 * on the saved version, so they wait until unsaved changes are saved.
 */
export function SoaActionBar({
  soaId,
  isDirty,
  isSubmitting,
  createLabel,
  emailDefaults,
}: {
  soaId?: string;
  isDirty: boolean;
  isSubmitting: boolean;
  createLabel: string;
  emailDefaults?: SoaEmailDefaults;
}) {
  const [isSendOpen, setIsSendOpen] = useState(false);
  const pdfHref = soaId ? `/admin/soa/${soaId}/pdf` : "";

  return (
    <FormActionBar className="flex-wrap">
      {soaId ? (
        isDirty ? (
          <span className="mr-auto text-sm text-muted-foreground">
            Save to view, download or email
          </span>
        ) : (
          <>
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<a href={pdfHref} target="_blank" rel="noopener" />}
            >
              View
            </Button>
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<a href={`${pdfHref}?download=1`} download />}
            >
              Download
            </Button>
            {emailDefaults ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setIsSendOpen(true)}
              >
                Email
              </Button>
            ) : null}
          </>
        )
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : soaId ? "Save Changes" : createLabel}
      </Button>

      {soaId && emailDefaults ? (
        <StopSubmit>
          <SoaSendDialog
            open={isSendOpen}
            onOpenChange={setIsSendOpen}
            soaId={soaId}
            defaults={emailDefaults}
          />
        </StopSubmit>
      ) : null}
    </FormActionBar>
  );
}
