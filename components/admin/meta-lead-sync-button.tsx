"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { syncMetaLeadsNow } from "@/actions/meta-leads";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Pulls the last few days of Meta lead ad leads into the CRM now, instead of
 * waiting for the nightly sync. Disabled (with a tooltip) outside production.
 */
export function MetaLeadSyncButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const logAction = {
    label: "View log",
    onClick: () => router.push("/admin/crm/sync-log"),
  };

  function handleClick() {
    startTransition(async () => {
      const response = await syncMetaLeadsNow();
      if (!response.ok) {
        toast.error("Meta lead sync failed", { description: response.error, action: logAction });
        router.refresh();
        return;
      }
      const { status, error, pulled, added, existing, lookbackDays } = response.result;
      const summary = `Pulled ${pulled} from Meta (last ${lookbackDays} days): ${added} new, ${existing} already in the CRM.`;
      if (status === "failed") {
        toast.error("Meta lead sync failed", {
          description: `${error ?? ""} ${summary}`.trim(),
          action: logAction,
        });
      } else {
        toast.success("Meta leads synced", { description: summary, action: logAction });
      }
      router.refresh();
    });
  }

  const button = (
    <Button variant="outline" onClick={handleClick} disabled={!enabled || isPending}>
      <RefreshCwIcon className={isPending ? "size-4 animate-spin" : "size-4"} />
      {isPending ? "Syncing…" : "Sync Meta leads"}
    </Button>
  );

  if (enabled) return button;

  // A disabled button gets no pointer events, so the tooltip hangs off a wrapper.
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />}>{button}</TooltipTrigger>
      <TooltipContent>Meta lead sync only runs on the live site.</TooltipContent>
    </Tooltip>
  );
}
