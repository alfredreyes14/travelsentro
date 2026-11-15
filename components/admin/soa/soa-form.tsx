"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
  SoaInstallmentsFields,
  SoaLineItemsFields,
  SoaPaymentsFields,
  SoaSummary,
} from "./soa-fields";
import {
  SoaActionBar,
  SoaBillToFields,
  SoaRemarksField,
  SoaSection,
  type SoaEmailDefaults,
} from "./soa-shared";
import type {
  SoaContactOption,
  SoaQuoteOption,
  SoaVoucherOption,
} from "@/lib/soa/soa-options";
import { useRemoveConfirmation } from "@/components/admin/itinerary-fields/remove-confirmation";
import { Form } from "@/components/ui/form";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Create (no soaId) or edit an SOA built in the SOA maker. Create mode
 * lives in memory until the first save, then redirects to the SOA's own
 * page where it can be viewed, downloaded and emailed.
 */
export function SoaForm({
  soaId,
  defaultValues,
  contacts,
  quotes,
  vouchers,
  existingTags,
  canCreateContact,
  emailDefaults,
}: {
  soaId?: string;
  defaultValues?: SoaFormValues;
  contacts: SoaContactOption[];
  quotes: SoaQuoteOption[];
  vouchers: SoaVoucherOption[];
  existingTags: string[];
  canCreateContact: boolean;
  emailDefaults?: SoaEmailDefaults;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SoaFormValues>({
    resolver: zodResolver(soaFormSchema),
    defaultValues: defaultValues ?? emptySoaValues(),
  });

  const { requestRemove, dialog: removeDialog } = useRemoveConfirmation("statement");

  async function onSubmit(values: SoaFormValues) {
    setIsSubmitting(true);
    try {
      if (soaId) {
        const result = await updateSoa(soaId, values);
        if (result.ok) {
          toast.success("Statement saved.");
          form.reset(values);
          router.refresh();
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
        <SoaSection title="Bill to">
          <SoaBillToFields
            contacts={contacts}
            quotes={quotes}
            existingTags={existingTags}
            canCreateContact={canCreateContact}
          />
        </SoaSection>

        <SoaSection title="Line items" description="Add anything you're billing for.">
          <SoaLineItemsFields onRequestRemove={requestRemove} />
        </SoaSection>

        <SoaSection
          title="Discounts & vouchers"
          description="Percent discounts are taken from the subtotal. Discounts never bring the total below ₱0."
        >
          <SoaDiscountsFields vouchers={vouchers} onRequestRemove={requestRemove} />
        </SoaSection>

        <SoaSection
          title="Payments received"
          description="Deducted from the total to get the balance due."
        >
          <SoaPaymentsFields onRequestRemove={requestRemove} defaultDate={todayInManila} />
        </SoaSection>

        <SoaSection
          title="Installments (optional)"
          description="Split the total into scheduled payments. Payments received are applied to the earliest installment first."
        >
          <SoaInstallmentsFields onRequestRemove={requestRemove} defaultDate={todayInManila} />
        </SoaSection>

        <SoaSection
          title="Remarks"
          description="e.g. bank / GCash details and payment terms. Printed at the bottom."
        >
          <SoaRemarksField />
        </SoaSection>

        <SoaSection title="Summary">
          <SoaSummary />
        </SoaSection>

        {removeDialog}

        <SoaActionBar
          soaId={soaId}
          isDirty={form.formState.isDirty}
          isSubmitting={isSubmitting}
          createLabel="Create Statement"
          emailDefaults={emailDefaults}
        />
      </form>
    </Form>
  );
}
