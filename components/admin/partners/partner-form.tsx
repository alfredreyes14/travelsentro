"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createPartner, updatePartner } from "@/actions/partners";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import {
  PARTNER_TYPE_LABELS,
  type PartnerType,
} from "@/lib/partners/partner-type";
import {
  partnerFormSchema,
  type PartnerFormValues,
} from "./partner-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const ACCEPTED_LOGO_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
];
// Logos are small; this also keeps the base64 payload well under the 10mb
// Server Action body limit set in next.config.ts.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type PartnerRecord = {
  id: string;
  name: string;
  logoStoragePath: string;
  linkUrl: string | null;
  isPublished: boolean;
};

/**
 * Add/edit form for one partner. `partner` is absent when adding. The
 * group (brand partner vs corporate client) comes from the tab the form
 * was opened in -- it is not a field the user can change.
 */
export function PartnerForm({
  partnerType,
  partner,
  onSuccess,
}: {
  partnerType: PartnerType;
  partner?: PartnerRecord;
  onSuccess: () => void;
}) {
  const labels = PARTNER_TYPE_LABELS[partnerType];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues: {
      name: partner?.name ?? "",
      logoStoragePath: partner?.logoStoragePath ?? "",
      linkUrl: partner?.linkUrl ?? "",
      isPublished: partner?.isPublished ?? true,
    },
  });

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    // The file picker's `accept` filter can be bypassed ("All files"), so
    // the type and size are checked here before anything is uploaded.
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error("Logo must be an SVG, PNG, JPG or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

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
      const result = partner
        ? await updatePartner(partner.id, values)
        : await createPartner(partnerType, values);

      if (result.ok) {
        toast.success(
          partner
            ? `${labels.singular} updated.`
            : `${labels.singular} added.`
        );
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
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
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
                <Input {...field} type="text" placeholder="e.g. Paynamics" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="logoStoragePath"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo</FormLabel>
              {field.value ? (
                <div className="flex items-center gap-3">
                  {/* Plain <img> -- admin thumbnail, mirrors
                      visa-service-form.tsx. White tile + object-contain so
                      a transparent logo stays legible and uncropped. */}
                  <img
                    src={getPublicImageUrl(field.value)}
                    alt=""
                    className="h-16 w-32 rounded-md bg-white object-contain p-2 ring-1 ring-foreground/10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field.onChange("")}
                  >
                    Remove logo
                  </Button>
                </div>
              ) : null}
              <FormControl>
                <input
                  type="file"
                  accept={ACCEPTED_LOGO_TYPES.join(",")}
                  disabled={isUploadingImage}
                  onChange={(event) =>
                    handleImageChange(event, (storagePath) =>
                      field.onChange(storagePath)
                    )
                  }
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
              </FormControl>
              <FormDescription>SVG, PNG, JPG or WebP, up to 2 MB.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="linkUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website link (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com"
                />
              </FormControl>
              <FormDescription>
                Visitors who click the logo are taken here. Leave blank for a
                logo that isn&apos;t clickable.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isPublished"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-input p-3">
              <FormLabel className="cursor-pointer">
                Show on the homepage
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isUploadingImage}
          className="self-end"
        >
          {isSubmitting
            ? "Saving..."
            : partner
              ? "Save Changes"
              : `Add ${labels.singular}`}
        </Button>
      </form>
    </Form>
  );
}
