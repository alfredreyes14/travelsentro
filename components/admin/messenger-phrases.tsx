"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { addStagePhrase, deleteStagePhrase } from "@/actions/messenger-phrases";
import { ContactStageChip } from "@/components/admin/contact-stage-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGE_LABELS, type ContactStage } from "@/lib/crm/stage";
import { useCan } from "@/components/admin/permissions-provider";

export type StagePhrase = { id: string; phrase: string; stage: ContactStage };

const STAGE_OPTIONS = ["inquiry", "quotation", "confirmation"] as const;
const STAGE_ITEMS = Object.fromEntries(STAGE_OPTIONS.map((s) => [s, STAGE_LABELS[s]]));

/** The saved-reply rules list, with add/delete for staff who can edit the CRM. */
export function MessengerPhrases({
  phrases,
  canEdit,
}: {
  phrases: StagePhrase[];
  canEdit: boolean;
}) {
  const canDelete = useCan("leads", "delete");
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [stage, setStage] = useState<string>("quotation");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      const result = await addStagePhrase({ phrase, stage });
      if (result.ok) {
        toast.success("Rule added.");
        setPhrase("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteStagePhrase(id);
      if (result.ok) {
        toast.success("Rule deleted.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {phrases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
          {phrases.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="flex-1">&ldquo;{p.phrase}&rdquo;</span>
              <span className="text-muted-foreground">moves to</span>
              <ContactStageChip stage={p.stage} />
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete rule"
                  disabled={isPending}
                  onClick={() => handleDelete(p.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
          <label htmlFor="phrase" className="text-sm font-medium">
            Add a rule
          </label>
          <Input
            id="phrase"
            placeholder="Paste a sentence from the saved reply, e.g. here are the available options"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">moves the lead to</span>
            <Select items={STAGE_ITEMS} value={stage} onValueChange={(v) => setStage(v as string)}>
              <SelectTrigger aria-label="Stage" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={isPending || phrase.trim().length < 10} onClick={handleAdd}>
              Add rule
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
