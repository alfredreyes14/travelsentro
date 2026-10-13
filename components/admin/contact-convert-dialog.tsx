"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { convertContactType } from "@/actions/crm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENT_TYPE_LABELS,
  STAGES_BY_TYPE,
  STAGE_LABELS,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";

const CONVERT_ERROR_MESSAGE =
  "Something went wrong converting this contact. Please try again.";

/**
 * Switches a contact to the other client type. The two pipelines don't
 * line up, so staff pick where the contact sits in the new one (New by
 * default). Nothing is deleted: the other type's fields stay stored.
 */
export function ContactConvertDialog({
  contactId,
  contactName,
  currentType,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  currentType: ClientType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const targetType: ClientType = currentType === "b2c" ? "b2b" : "b2c";
  const [stage, setStage] = useState<ContactStage>("new");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stageItems = Object.fromEntries(
    STAGES_BY_TYPE[targetType].map((s) => [s, STAGE_LABELS[s]])
  );

  function handleOpenChange(next: boolean) {
    if (!next) setStage("new");
    onOpenChange(next);
  }

  async function handleConvert() {
    setIsSubmitting(true);
    try {
      const result = await convertContactType(contactId, targetType, stage);
      if (result.ok) {
        toast.success(`Converted to ${CLIENT_TYPE_LABELS[targetType]}.`);
        handleOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(CONVERT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Convert to {CLIENT_TYPE_LABELS[targetType]}
          </DialogTitle>
          <DialogDescription>
            {contactName} moves to the {CLIENT_TYPE_LABELS[targetType]} list
            and pipeline. Its {CLIENT_TYPE_LABELS[currentType]} details are
            kept and come back if you convert it again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Stage in the {CLIENT_TYPE_LABELS[targetType]} pipeline
          </span>
          <Select
            items={stageItems}
            value={stage}
            onValueChange={(value) => setStage(value as ContactStage)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES_BY_TYPE[targetType].map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={isSubmitting}>
            {isSubmitting ? "Converting..." : "Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
