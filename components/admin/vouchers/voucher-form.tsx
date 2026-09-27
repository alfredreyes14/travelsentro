"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createVoucher, updateVoucher } from "@/actions/vouchers";
import {
  voucherFormSchema,
  type VoucherFormValues,
} from "./voucher-form-schema";
import {
  VOUCHER_STATUSES,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPES,
  VOUCHER_TYPE_LABELS,
  type VoucherStatus,
  type VoucherType,
} from "@/lib/vouchers/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const TYPE_ITEMS = VOUCHER_TYPES.map((value) => ({
  value,
  label: VOUCHER_TYPE_LABELS[value],
}));

const STATUS_ITEMS = VOUCHER_STATUSES.map((value) => ({
  value,
  label: VOUCHER_STATUS_LABELS[value],
}));

const IN_HOUSE_VALUE = "";

export type VoucherPartnerOption = { id: string; name: string };
export type VoucherContactOption = { id: string; name: string; email: string };

// A DB-shaped record (nullable relation/optional fields as `null`, matching
// the vouchers table), distinct from VoucherFormValues (RHF's internal
// all-strings shape, where "" means unset) -- EditVoucherForm below is what
// converts between the two.
export type VoucherRecord = {
  id: string;
  type: VoucherType;
  partnerId: string | null;
  title: string;
  valueLabel: string;
  code: string | null;
  contactId: string | null;
  status: VoucherStatus;
  expiresAt: string | null;
};

type VoucherFormProps = {
  partners: VoucherPartnerOption[];
  contacts: VoucherContactOption[];
  onSuccess: () => void;
} & ({ mode: "create" } | { mode: "edit"; voucher: VoucherRecord });

/**
 * Renders either the create or edit voucher form, mirroring
 * destination-form.tsx's dual create/edit dispatch shape.
 */
export function VoucherForm(props: VoucherFormProps) {
  if (props.mode === "create") {
    return (
      <CreateVoucherForm
        partners={props.partners}
        contacts={props.contacts}
        onSuccess={props.onSuccess}
      />
    );
  }

  return (
    <EditVoucherForm
      voucher={props.voucher}
      partners={props.partners}
      contacts={props.contacts}
      onSuccess={props.onSuccess}
    />
  );
}

function CreateVoucherForm({
  partners,
  contacts,
  onSuccess,
}: {
  partners: VoucherPartnerOption[];
  contacts: VoucherContactOption[];
  onSuccess: () => void;
}) {
  return (
    <VoucherFormBody
      partners={partners}
      contacts={contacts}
      defaultValues={{
        type: "digital",
        partnerId: IN_HOUSE_VALUE,
        title: "",
        valueLabel: "",
        code: "",
        contactId: "",
        status: "available",
        expiresAt: "",
      }}
      submitLabel="Add Voucher"
      onSubmit={async (values) => {
        const result = await createVoucher(values);
        if (result.ok) {
          toast.success("Voucher added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditVoucherForm({
  voucher,
  partners,
  contacts,
  onSuccess,
}: {
  voucher: VoucherRecord;
  partners: VoucherPartnerOption[];
  contacts: VoucherContactOption[];
  onSuccess: () => void;
}) {
  return (
    <VoucherFormBody
      partners={partners}
      contacts={contacts}
      defaultValues={{
        type: voucher.type,
        partnerId: voucher.partnerId ?? IN_HOUSE_VALUE,
        title: voucher.title,
        valueLabel: voucher.valueLabel,
        code: voucher.code ?? "",
        contactId: voucher.contactId ?? "",
        status: voucher.status,
        expiresAt: voucher.expiresAt ?? "",
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateVoucher(voucher.id, values);
        if (result.ok) {
          toast.success("Voucher updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function VoucherFormBody({
  partners,
  contacts,
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  partners: VoucherPartnerOption[];
  contacts: VoucherContactOption[];
  defaultValues: VoucherFormValues;
  submitLabel: string;
  onSubmit: (values: VoucherFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues,
  });

  const selectedContact =
    contacts.find((c) => c.id === form.watch("contactId")) ?? null;

  async function handleSubmit(values: VoucherFormValues) {
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select
                  items={TYPE_ITEMS}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  items={STATUS_ITEMS}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STATUS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="10% off any tour" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="valueLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Value</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="₱500 off, Free breakfast, etc." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="partnerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Partner</FormLabel>
                <Select
                  value={field.value || IN_HOUSE_VALUE}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="In-house (TravelSentro)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={IN_HOUSE_VALUE}>
                      In-house (TravelSentro)
                    </SelectItem>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code / serial (optional)</FormLabel>
                <FormControl>
                  <Input {...field} type="text" placeholder="TS-2026-0001" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contactId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned to (optional)</FormLabel>
                <FormControl>
                  <Combobox
                    items={contacts}
                    value={selectedContact}
                    onValueChange={(contact) =>
                      field.onChange(contact?.id ?? "")
                    }
                    itemToStringLabel={(contact: VoucherContactOption) =>
                      `${contact.name} (${contact.email})`
                    }
                  >
                    <ComboboxInputGroup>
                      <ComboboxInput placeholder="Leave unassigned..." />
                      {selectedContact ? (
                        <ComboboxClear />
                      ) : (
                        <ComboboxTrigger />
                      )}
                    </ComboboxInputGroup>
                    <ComboboxPortal>
                      <ComboboxPositioner>
                        <ComboboxPopup>
                          <ComboboxEmpty>No contacts found.</ComboboxEmpty>
                          <ComboboxList>
                            {(contact: VoucherContactOption) => (
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

          <FormField
            control={form.control}
            name="expiresAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expires (optional)</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
