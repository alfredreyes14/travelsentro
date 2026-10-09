"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createVisaService, updateVisaService } from "@/actions/visa-services";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import {
  visaServiceFormSchema,
  type VisaServiceFormValues,
} from "./visa-service-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type VisaServiceRecord = {
  id: string;
  country: string;
  description: string | null;
  processingTime: string | null;
  price: number | null;
  requirements: string | null;
  photoStoragePath: string | null;
  isPublished: boolean;
};

type VisaServiceFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; visaService: VisaServiceRecord; onSuccess: () => void };

/**
 * Renders either the create or edit visa service form, mirroring
 * faq-form.tsx's dual create/edit dispatch shape, with destination-form.tsx's
 * single-photo upload.
 */
export function VisaServiceForm(props: VisaServiceFormProps) {
  if (props.mode === "create") {
    return <CreateVisaServiceForm onSuccess={props.onSuccess} />;
  }

  return (
    <EditVisaServiceForm
      visaService={props.visaService}
      onSuccess={props.onSuccess}
    />
  );
}

function CreateVisaServiceForm({ onSuccess }: { onSuccess: () => void }) {
  return (
    <VisaServiceFormBody
      defaultValues={{
        country: "",
        description: "",
        processingTime: "",
        price: undefined,
        requirements: "",
        photoStoragePath: "",
        isPublished: true,
      }}
      submitLabel="Add Visa Service"
      onSubmit={async (values) => {
        const result = await createVisaService(values);
        if (result.ok) {
          toast.success("Visa service added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditVisaServiceForm({
  visaService,
  onSuccess,
}: {
  visaService: VisaServiceRecord;
  onSuccess: () => void;
}) {
  return (
    <VisaServiceFormBody
      defaultValues={{
        country: visaService.country,
        description: visaService.description ?? "",
        processingTime: visaService.processingTime ?? "",
        price: visaService.price ?? undefined,
        requirements: visaService.requirements ?? "",
        photoStoragePath: visaService.photoStoragePath ?? "",
        isPublished: visaService.isPublished,
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateVisaService(visaService.id, values);
        if (result.ok) {
          toast.success("Visa service updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function VisaServiceFormBody({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: VisaServiceFormValues;
  submitLabel: string;
  onSubmit: (values: VisaServiceFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const form = useForm<VisaServiceFormValues>({
    resolver: zodResolver(visaServiceFormSchema),
    defaultValues,
  });

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("visa-services", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
        toast.success("Image uploaded.");
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

  async function handleSubmit(values: VisaServiceFormValues) {
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
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <FormControl>
                <Input {...field} type="text" placeholder="e.g. Japan" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="e.g. Tourist visa application assistance, single entry"
                  className="min-h-20"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="processingTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Processing time (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="e.g. 5–7 working days"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starting price (PHP, optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={1}
                    prefix="₱"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? undefined
                          : event.target.valueAsNumber
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="requirements"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requirements (optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={
                    "Valid passport (at least 6 months)\n2x2 photo, white background\nBank certificate"
                  }
                  className="min-h-32"
                />
              </FormControl>
              <FormDescription>One requirement per line.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="photoStoragePath"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photo (optional)</FormLabel>
              {field.value ? (
                <div className="flex items-center gap-3">
                  {/* Plain <img> -- admin thumbnail, mirrors
                      destinations-list.tsx's convention. */}
                  <img
                    src={getPublicImageUrl(field.value)}
                    alt=""
                    className="size-16 rounded-md object-cover"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field.onChange("")}
                  >
                    Remove photo
                  </Button>
                </div>
              ) : null}
              <FormControl>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingImage}
                  onChange={(event) =>
                    handleImageChange(event, (storagePath) =>
                      field.onChange(storagePath)
                    )
                  }
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
              </FormControl>
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
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
