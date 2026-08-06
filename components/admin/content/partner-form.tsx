"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createPartner, updatePartner } from "@/actions/partners";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import {
  partnerFormSchema,
  type PartnerFormValues,
} from "./partner-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export type PartnerType = "brand_partner" | "corporate_client";

export type PartnerRecord = {
  id: string;
  logoStoragePath: string;
  linkUrl: string | null;
};

type PartnerFormProps =
  | { mode: "create"; partnerType: PartnerType; onSuccess: () => void }
  | {
      mode: "edit";
      partnerType: PartnerType;
      partner: PartnerRecord;
      onSuccess: () => void;
    };

/**
 * Renders either the create or edit partner/client form. partnerType is
 * ALWAYS a fixed prop passed in by the caller (which button opened the
 * dialog) -- never a form field the user selects (D-07). Mirrors
 * testimonial-form.tsx's dual create/edit dispatch + pre-submit image
 * upload shape.
 */
export function PartnerForm(props: PartnerFormProps) {
  const submitLabel =
    props.partnerType === "brand_partner" ? "Add Partner" : "Add Client";

  if (props.mode === "create") {
    return (
      <CreatePartnerForm
        partnerType={props.partnerType}
        submitLabel={submitLabel}
        onSuccess={props.onSuccess}
      />
    );
  }

  return (
    <EditPartnerForm
      partnerType={props.partnerType}
      partner={props.partner}
      onSuccess={props.onSuccess}
    />
  );
}

function CreatePartnerForm({
  partnerType,
  submitLabel,
  onSuccess,
}: {
  partnerType: PartnerType;
  submitLabel: string;
  onSuccess: () => void;
}) {
  return (
    <PartnerFormBody
      defaultValues={{ logoStoragePath: "", linkUrl: "" }}
      submitLabel={submitLabel}
      onSubmit={async (values) => {
        const result = await createPartner({ ...values, partnerType });
        if (result.ok) {
          toast.success(
            partnerType === "brand_partner"
              ? "Partner added."
              : "Client added."
          );
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditPartnerForm({
  partnerType,
  partner,
  onSuccess,
}: {
  partnerType: PartnerType;
  partner: PartnerRecord;
  onSuccess: () => void;
}) {
  return (
    <PartnerFormBody
      defaultValues={{
        logoStoragePath: partner.logoStoragePath,
        linkUrl: partner.linkUrl ?? "",
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updatePartner(partner.id, {
          ...values,
          partnerType,
        });
        if (result.ok) {
          toast.success("Changes saved.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function PartnerFormBody({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: PartnerFormValues;
  submitLabel: string;
  onSubmit: (values: PartnerFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues,
  });

  async function handleLogoChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("partners", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
        toast.success("Logo uploaded.");
      } else {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(values: PartnerFormValues) {
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
          name="logoStoragePath"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo</FormLabel>
              <FormControl>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingImage}
                  onChange={(event) =>
                    handleLogoChange(event, (storagePath) =>
                      field.onChange(storagePath)
                    )
                  }
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
              </FormControl>
              {field.value ? (
                <p className="text-sm text-muted-foreground">
                  Logo uploaded.
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="linkUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link URL (optional)</FormLabel>
              <FormControl>
                <Input {...field} type="url" placeholder="https://..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isUploadingImage}
          className="self-start"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
