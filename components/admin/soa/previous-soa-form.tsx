"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FileTextIcon, XIcon } from "lucide-react";

import {
  createPreviousSoa,
  createSoaFileUpload,
  updatePreviousSoa,
} from "@/actions/soa";
import {
  emptyPreviousSoaValues,
  previousSoaFormSchema,
  type PreviousSoaFormValues,
} from "./soa-form-schema";
import {
  SoaActionBar,
  SoaBillToFields,
  SoaNotesField,
  SoaSection,
  type SoaEmailDefaults,
} from "./soa-shared";
import { DOCUMENT_ACCEPT, checkDocument, formatBytes } from "@/lib/crm/documents";
import type { SoaFileChange } from "@/lib/soa/files";
import type { SoaContactOption } from "@/lib/soa/soa-options";
import { formatPeso } from "@/lib/soa/totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export type SavedSoaFile = { name: string; sizeBytes: number };

/** Uploads a picked file straight to storage; the save then records it. */
async function uploadFile(file: File): Promise<SoaFileChange | { error: string }> {
  const started = await createSoaFileUpload({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!started.ok) return { error: started.error };

  const put = await fetch(started.url, {
    method: "PUT",
    headers: { "Content-Type": started.contentType },
    body: file,
  });
  if (!put.ok) return { error: "The file upload failed. Please try again." };

  return { action: "replace", key: started.key, fileName: file.name };
}

function moneyInputProps(field: {
  name: string;
  value: unknown;
  onBlur: () => void;
  onChange: (value: number | undefined) => void;
  ref: React.Ref<HTMLInputElement>;
}) {
  return {
    name: field.name,
    ref: field.ref,
    onBlur: field.onBlur,
    value: typeof field.value === "number" && Number.isFinite(field.value) ? field.value : "",
    type: "number" as const,
    inputMode: "decimal" as const,
    step: "0.01",
    min: 0,
    prefix: "₱",
    placeholder: "0.00",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      field.onChange(event.target.value === "" ? undefined : event.target.valueAsNumber),
  };
}

/**
 * Records an SOA issued before this system (or outside it) so its amount
 * is on file: the amounts are typed in, and the original document can be
 * attached.
 */
export function PreviousSoaForm({
  soaId,
  defaultValues,
  savedFile,
  contacts,
  existingTags,
  canCreateContact,
  emailDefaults,
}: {
  soaId?: string;
  defaultValues?: PreviousSoaFormValues;
  savedFile?: SavedSoaFile | null;
  contacts: SoaContactOption[];
  existingTags: string[];
  canCreateContact: boolean;
  emailDefaults?: SoaEmailDefaults;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [removeSaved, setRemoveSaved] = useState(false);

  const form = useForm<PreviousSoaFormValues>({
    resolver: zodResolver(previousSoaFormSchema),
    defaultValues: defaultValues ?? emptyPreviousSoaValues(),
  });

  const [total, paid] = useWatch({ control: form.control, name: ["totalAmount", "amountPaid"] });
  const balance =
    (Number.isFinite(total) ? total : 0) - (Number.isFinite(paid) ? paid : 0);

  const shownFile = pickedFile
    ? { name: pickedFile.name, sizeBytes: pickedFile.size }
    : savedFile && !removeSaved
      ? savedFile
      : null;
  const fileChanged = pickedFile !== null || removeSaved;

  function pickFile(file: File | undefined) {
    if (!file) return;
    const checked = checkDocument(file);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    setPickedFile(file);
  }

  function clearFile() {
    setPickedFile(null);
    if (savedFile) setRemoveSaved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(values: PreviousSoaFormValues) {
    setIsSubmitting(true);
    try {
      let fileChange: SoaFileChange = removeSaved ? { action: "remove" } : { action: "keep" };
      if (pickedFile) {
        const uploaded = await uploadFile(pickedFile);
        if ("error" in uploaded) {
          toast.error(uploaded.error);
          setIsSubmitting(false);
          return;
        }
        fileChange = uploaded;
      }

      if (soaId) {
        const result = await updatePreviousSoa(soaId, values, fileChange);
        if (result.ok) {
          toast.success("Statement saved.");
          form.reset(values);
          setPickedFile(null);
          setRemoveSaved(false);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createPreviousSoa(values, fileChange);
        if (result.ok && result.id) {
          toast.success("Previous SOA added.");
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
            existingTags={existingTags}
            canCreateContact={canCreateContact}
          />
        </SoaSection>

        <SoaSection title="Amounts">
          <FormField
            control={form.control}
            name="originalNo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Original SOA no. (optional)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="text" placeholder="e.g. 2025-0142" />
                </FormControl>
                <FormDescription>The number printed on the original statement.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total amount</FormLabel>
                  <FormControl>
                    <Input {...moneyInputProps(field)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amountPaid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount paid</FormLabel>
                  <FormControl>
                    <Input {...moneyInputProps(field)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex items-baseline justify-between rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground">
            <span>{balance < 0 ? "Credit balance" : "Balance due"}</span>
            <span className="tabular-nums">{formatPeso(Math.abs(balance))}</span>
          </div>
        </SoaSection>

        <SoaSection
          title="Original document (optional)"
          description="Attach the original SOA — PDF, image, Word or Excel, up to 20 MB. It's what View, Download and Email use; without one, a PDF is made from the amounts above."
        >
          {shownFile ? (
            <div className="flex items-center gap-3 rounded-lg border border-input bg-muted/30 p-3 text-sm">
              <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{shownFile.name}</p>
                <p className="text-muted-foreground">
                  {formatBytes(shownFile.sizeBytes)}
                  {pickedFile ? " · uploads when you save" : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearFile} aria-label="Remove file">
                <XIcon className="size-4" />
                Remove
              </Button>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => fileInputRef.current?.click()}
          >
            {shownFile ? "Replace file" : "Attach file"}
          </Button>
          {removeSaved && !pickedFile ? (
            <p className="text-sm text-muted-foreground">The attached file is removed when you save.</p>
          ) : null}
        </SoaSection>

        <SoaSection title="Notes (optional)">
          <SoaNotesField />
        </SoaSection>

        <SoaActionBar
          soaId={soaId}
          isDirty={form.formState.isDirty || fileChanged}
          isSubmitting={isSubmitting}
          createLabel="Add Previous SOA"
          emailDefaults={emailDefaults}
        />
      </form>
    </Form>
  );
}
