import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { MetaLeadSyncButton } from "./meta-lead-sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SyncRunStatus = "success" | "failed" | "running" | "timed_out";

export type SyncRunItem = {
  id: string;
  trigger: "cron" | "manual";
  triggeredByName: string | null;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  lookbackDays: number | null;
  forms: number | null;
  pulled: number;
  added: number;
  existing: number;
  noContact: number;
  failed: number;
  error: string | null;
  errorDetail: string | null;
  leadErrors: { leadgenId: string; formName: string | null; error: string }[];
};

/** Shown for a run that never recorded its result. */
const TIMED_OUT_MESSAGE =
  "The sync didn't finish: it was stopped at the 60-second time limit or the server crashed, " +
  "so its counts weren't recorded. Leads saved before it stopped are in the CRM, and the next " +
  "sync will pick up the rest. If this keeps happening, lower META_LEADS_LOOKBACK_DAYS.";

const STATUS_BADGE: Record<SyncRunStatus, { label: string; className: string }> = {
  success: { label: "SUCCESS", className: "border-green-200 bg-green-100 text-green-800" },
  failed: { label: "FAILED", className: "border-red-200 bg-red-100 text-red-800" },
  timed_out: { label: "FAILED", className: "border-red-200 bg-red-100 text-red-800" },
  running: { label: "RUNNING", className: "border-amber-200 bg-amber-100 text-amber-800" },
};

const dateTimeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const seconds = Math.max(
    0,
    Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | null;
  hint?: string;
  tone?: "good" | "bad" | "muted";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2" title={hint}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "good" && value ? "text-green-700" : null,
          tone === "bad" && value ? "text-red-700" : null,
          tone === "muted" ? "text-muted-foreground" : null
        )}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function SyncRunCard({ run }: { run: SyncRunItem }) {
  const badge = STATUS_BADGE[run.status];
  const hasResult = run.status === "success" || run.status === "failed";
  const duration = formatDuration(run.startedAt, run.finishedAt);
  const error = run.status === "timed_out" ? TIMED_OUT_MESSAGE : run.error;
  const hasDetails = Boolean(run.errorDetail) || run.leadErrors.length > 0;

  return (
    <Card className="gap-3 px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="outline" className={badge.className}>
          {badge.label}
        </Badge>
        <span className="font-medium">{dateTimeFormat.format(new Date(run.startedAt))}</span>
        <span className="text-muted-foreground">
          {run.trigger === "cron"
            ? "Nightly sync"
            : `Manual sync${run.triggeredByName ? ` by ${run.triggeredByName}` : ""}`}
        </span>
        <span className="text-muted-foreground">
          {[
            run.lookbackDays ? `last ${run.lookbackDays} days` : null,
            hasResult && run.forms !== null
              ? `${run.forms} lead form${run.forms === 1 ? "" : "s"}`
              : null,
            duration ? `took ${duration}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Pulled from Meta" value={hasResult ? run.pulled : null} />
        <Stat
          label="New leads saved"
          value={hasResult ? run.added : null}
          tone="good"
          hint="New Meta leads written to the CRM on this run"
        />
        <Stat
          label="Already in CRM"
          value={hasResult ? run.existing : null}
          tone="muted"
          hint="Saved by an earlier sync; nothing new to write"
        />
        <Stat
          label="Skipped"
          value={hasResult ? run.noContact : null}
          tone="muted"
          hint="Leads with neither an email nor a phone number can't be stored"
        />
        <Stat
          label="Failed to save"
          value={hasResult ? run.failed : null}
          tone="bad"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {hasDetails ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Technical details
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {run.leadErrors.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {run.leadErrors.map((leadError, index) => (
                  <li key={`${leadError.leadgenId}-${index}`} className="break-words">
                    <span className="font-mono text-xs">{leadError.leadgenId}</span>
                    {leadError.formName ? (
                      <span className="text-muted-foreground"> ({leadError.formName})</span>
                    ) : null}
                    : {leadError.error}
                  </li>
                ))}
              </ul>
            ) : run.errorDetail ? (
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {run.errorDetail}
              </pre>
            ) : null}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

/** The Meta lead sync log: one card per run, newest first. */
export function MetaLeadSyncLog({
  runs,
  loadError,
  canSync,
  syncEnabled,
}: {
  runs: SyncRunItem[];
  loadError: string | null;
  canSync: boolean;
  syncEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          nativeButton={false}
          render={<Link href="/admin/crm" />}
        >
          <ArrowLeftIcon className="size-4" />
          Leads
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
              Meta Lead Sync Log
            </h1>
            <p className="text-base leading-[1.5] text-muted-foreground">
              Every pull of Facebook lead ad leads into the CRM, nightly at 11:59 PM and on demand.
            </p>
          </div>
          {canSync ? <MetaLeadSyncButton enabled={syncEnabled} /> : null}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {loadError}
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">No syncs yet</h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            {syncEnabled
              ? "Runs appear here after the nightly sync or when someone presses “Sync Meta leads”."
              : "Meta lead sync only runs on the live site, so this log stays empty here."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {runs.map((run) => (
            <SyncRunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
